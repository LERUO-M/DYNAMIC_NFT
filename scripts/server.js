require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const dNFTArtifact = require('../artifacts/contracts/GROUPdNFT.sol/GROUP_dNFT.json');
const dNFTABI = dNFTArtifact.abi;

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const ownerWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractAddress = process.env.DNFT_ADDR;
const nftContract = new ethers.Contract(contractAddress, dNFTABI, ownerWallet);

const SIGN_IN_MESSAGE = "Welcome to the Club! Please sign this message to verify your wallet ownership.";

// In-memory visit tracker per tokenId. Resets on server restart — on-chain state is the source of truth.
const tokenVisits = {};

function verifySignature(walletAddress, signature) {
    const recovered = ethers.verifyMessage(SIGN_IN_MESSAGE, signature);
    return recovered.toLowerCase() === walletAddress.toLowerCase();
}

// POST /verify-nft — confirms wallet signature and NFT ownership
app.post('/verify-nft', async (req, res) => {
    const { walletAddress, signature } = req.body;
    if (!walletAddress || !signature) {
        return res.status(400).json({ authorized: false, message: "Missing address or signature" });
    }
    try {
        if (!verifySignature(walletAddress, signature)) {
            console.log("[verify-nft] Bad signature for", walletAddress);
            return res.status(401).json({ authorized: false, message: "Invalid signature." });
        }
        const balance = await nftContract.balanceOf(walletAddress);
        console.log(`[verify-nft] wallet=${walletAddress} balance=${balance.toString()}`);
        if (balance > 0n) {
            res.json({ authorized: true, message: "Access Granted" });
        } else {
            res.status(403).json({ authorized: false, message: "No NFT found. Mint one first." });
        }
    } catch (err) {
        console.error("[verify-nft] error:", err);
        res.status(500).json({ authorized: false, message: "Server error" });
    }
});

// GET /my-token/:address — returns the tokenId owned by this address
app.get('/my-token/:address', async (req, res) => {
    try {
        const address = req.params.address;
        const balance = await nftContract.balanceOf(address);
        const nextId = await nftContract.nextTokenId();
        console.log(`[my-token] address=${address} balance=${balance.toString()} nextTokenId=${nextId.toString()}`);
        if (balance === 0n) {
            return res.json({ tokenId: null, hasNFT: false });
        }
        for (let i = 0n; i < nextId; i++) {
            const owner = await nftContract.ownerOf(i);
            console.log(`[my-token] token ${i} owner=${owner}`);
            if (owner.toLowerCase() === address.toLowerCase()) {
                console.log(`[my-token] found token ${i} for ${address}`);
                return res.json({ tokenId: i.toString(), hasNFT: true });
            }
        }
        res.json({ tokenId: null, hasNFT: false });
    } catch (err) {
        console.error("[my-token] error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// GET /nft-status/:tokenId — current visit count and metadata URL
app.get('/nft-status/:tokenId', async (req, res) => {
    try {
        const tokenId = BigInt(req.params.tokenId);
        const onChainVisits = await nftContract.tokensSiteVisits(tokenId);
        const serverVisits = tokenVisits[req.params.tokenId] || 0;
        const evolved = onChainVisits >= 15n;

        // Build the metadata URL directly — mirrors tokenURI logic in the contract
        const baseURI = await nftContract.baseURI();
        const gatewayToken = process.env.PINATA_GATEWAY_KEY || '';
        const metadataURL = baseURI + (evolved ? "1.json" : "0.json")
            + (gatewayToken ? `?pinataGatewayToken=${gatewayToken}` : '');
        console.log(`[nft-status] tokenId=${req.params.tokenId} onChainVisits=${onChainVisits} evolved=${evolved} metadataURL=${metadataURL}`);

        res.json({
            tokenId: req.params.tokenId,
            serverVisits,
            onChainVisits: onChainVisits.toString(),
            evolved,
            metadataURL,
            gatewayToken,
        });
    } catch (err) {
        console.error("nft-status error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// POST /increment-visit — records a visit; pushes points on-chain when server count hits 15
app.post('/increment-visit', async (req, res) => {
    const { tokenId, walletAddress, signature } = req.body;
    if (tokenId === undefined || !walletAddress || !signature) {
        return res.status(400).json({ error: "Missing tokenId, walletAddress, or signature" });
    }
    try {
        if (!verifySignature(walletAddress, signature)) {
            return res.status(401).json({ error: "Invalid signature" });
        }
        const balance = await nftContract.balanceOf(walletAddress);
        if (balance === 0n) {
            return res.status(403).json({ error: "Wallet does not own an NFT" });
        }

        const key = String(tokenId);
        tokenVisits[key] = (tokenVisits[key] || 0) + 1;
        const visits = tokenVisits[key];

        // Check current on-chain visits so we never overshoot or double-update
        const onChainVisits = await nftContract.tokensSiteVisits(BigInt(tokenId));
        let evolved = onChainVisits >= 15n;

        if (!evolved && visits >= 15) {
            const pointsNeeded = 15n - onChainVisits;
            if (pointsNeeded > 0n) {
                console.log(`Token ${tokenId}: pushing ${pointsNeeded} points on-chain`);
                const tx = await nftContract.updatePoints(BigInt(tokenId), pointsNeeded);
                await tx.wait();
                evolved = true;
                console.log(`Token ${tokenId} metadata evolved!`);
            }
        }

        res.json({ visits, evolved });
    } catch (err) {
        console.error("increment-visit error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// POST /reset-visit — owner-only: resets on-chain visits and server counter to 0
app.post('/reset-visit', async (req, res) => {
    const { tokenId, walletAddress, signature } = req.body;
    if (tokenId === undefined || !walletAddress || !signature) {
        return res.status(400).json({ error: "Missing tokenId, walletAddress, or signature" });
    }
    try {
        if (!verifySignature(walletAddress, signature)) {
            return res.status(401).json({ error: "Invalid signature" });
        }
        if (walletAddress.toLowerCase() !== ownerWallet.address.toLowerCase()) {
            return res.status(403).json({ error: "Only the contract owner can reset visits" });
        }
        const tx = await nftContract.resetVisits(BigInt(tokenId));
        await tx.wait();
        tokenVisits[String(tokenId)] = 0;
        console.log(`[reset-visit] tokenId=${tokenId} reset to 0`);
        res.json({ success: true, visits: 0 });
    } catch (err) {
        console.error("[reset-visit] error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));

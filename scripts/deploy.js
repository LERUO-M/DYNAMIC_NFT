const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying GROUP_dNFT with account:", deployer.address);

    // baseURI points to the IPFS folder containing 0.json and 1.json
    const baseURI = process.env.PINATA_BASE_URL + process.env.PINATA_CID_OF_NFT + "/";
    console.log("Base URI for metadata:", baseURI);

    const GroupdNFTFactory = await ethers.getContractFactory("GROUP_dNFT");
    const nft = await upgrades.deployProxy(GroupdNFTFactory, [baseURI], {
        initializer: "initialize",
        kind: "uups",
    });

    await nft.waitForDeployment();
    console.log("Proxy deployed at:", nft.target);
    console.log(">>> Set DNFT_ADDR=" + nft.target + " in your .env <<<");

    const implAddr = await upgrades.erc1967.getImplementationAddress(nft.target);
    console.log("Implementation at:", implAddr);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

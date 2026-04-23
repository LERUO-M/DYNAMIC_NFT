const { ethers, upgrades} = require("hardhat");
const { parseEther } = require("viem");

async function main(){
    const[user1, user2, user3] = await ethers.getSigners();
    const baseURI = process.env.PINATA_BASE_URI_OF_METADATA + "/";

    console.log("Deploying contract....");
    const NFT = await ethers.getContractFactory("GROUP_dNFT");
    const nft = await upgrades.deployProxy(NFT, [baseURI], {
        initializer: "initialize",
        kind: "uups"
    });
    await nft.waitForDeployment();
    const nftAddress = await nft.getAddress();
    console.log("NFT deployed to:", nftAddress);
    
    await nft.connect(user1).mint({ value: ethers.parseEther("0.0001") });
    console.log("User1 owns: ", (await nft.balanceOf(user1.address)).toString());

    const tokenURi = await nft.tokenURI(0);
    console.log("Token URI: ", tokenURi);

    await nft.updatePoints(0, 20);
    console.log("Points updated for token 0");

    const newTokenURi = await nft.tokenURI(0);
    console.log("Token URI: ", newTokenURi);


}
main().catch(console.error)
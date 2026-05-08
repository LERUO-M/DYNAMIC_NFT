const { ethers, upgrades } = require("hardhat");

async function main() {
    const proxyAddress = process.env.DNFT_ADDR;
    if (!proxyAddress) throw new Error("DNFT_ADDR not set in .env");

    const [deployer] = await ethers.getSigners();
    console.log("Upgrading GROUP_dNFT with account:", deployer.address);
    console.log("Proxy address:", proxyAddress);

    const GroupdNFTFactory = await ethers.getContractFactory("GROUP_dNFT");
    const upgraded = await upgrades.upgradeProxy(proxyAddress, GroupdNFTFactory, {
        kind: "uups",
    });

    await upgraded.waitForDeployment();

    const newImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("Proxy address (unchanged):", proxyAddress);
    console.log("New implementation deployed at:", newImpl);
    console.log("Upgrade complete.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

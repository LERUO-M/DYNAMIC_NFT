// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

contract GROUP_dNFT is Initializable, ERC721Upgradeable, 
    OwnableUpgradeable, 
    UUPSUpgradeable {
        uint256 public nextTokenId;
        string public baseURI;

        mapping (uint256 => uint256) public tokensSiteVisits;

        // Reserve slot gap
        uint256[50] private __gap;

        event MintedNFT(uint256 tokenId, address owner);
        event PointsUpdated(uint256 tokenId, uint256 points);
        event UpdatedMetadata(uint256 tokenId);

        ///@custom:oz-upgrades-unsafe-allow constructor
        constructor() {
            _disableInitializers();
        }

        function initialize(string memory baseURI_)  public initializer{
            baseURI = baseURI_;
            __ERC721_init("GROUP-dNFT", "DEVM");
            __Ownable_init(msg.sender);
            //__UUPSUpgradeable_init();
        }

        function mint() public payable {
            require(balanceOf(msg.sender) == 0, "You are only allowed to mint one NFT to user and have already minted one");
            require(msg.value == 0.0001 ether, "Minting requires a payment of EXACTLY 0.0001 ether");
            _safeMint(msg.sender , nextTokenId);
            tokensSiteVisits[nextTokenId] = 0;
            nextTokenId++;

            emit MintedNFT(nextTokenId - 1, msg.sender);
        }

        function tokenURI(uint256 tokenId) public view override returns (string memory) {
            require(_ownerOf(tokenId) != address(0), "ERC721Metadata: URI query for nonexistent token");
            require(_ownerOf(tokenId) == msg.sender, "You are not the owner of this token");

            if (tokensSiteVisits[tokenId] < 15) {
                return string(abi.encodePacked(baseURI, "0.json"));
            } else {
                return string(abi.encodePacked(baseURI, "1.json"));
            }
        }

        function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
            address from = _ownerOf(tokenId);
            
            if (from != address(0) && to != address(0)) {
                revert("LifeClub: This NFT is Soulbound and cannot be transferred.");
            }

            return super._update(to, tokenId, auth);
        }

        function setBaseURI(string memory baseURI_) public onlyOwner {
            baseURI = baseURI_;
        }

        function updatePoints(uint256 tokenId, uint256 points) public onlyOwner {
            tokensSiteVisits[tokenId] = tokensSiteVisits[tokenId] + points;

            emit PointsUpdated(tokenId, tokensSiteVisits[tokenId]);
            emit UpdatedMetadata(tokenId);
        }

        function _authorizeUpgrade(address newImpl) internal override  onlyOwner {}
    }
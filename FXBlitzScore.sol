// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FXBlitzScore
 * @notice On-chain scoreboard for Arc FX Blitz — 30-second trading sprint
 * @dev Arc Network: EVM-compatible, USDC-native gas, sub-second finality
 */
contract FXBlitzScore {

    struct GameSession {
        address player;
        uint256 scoreBps;
        uint256 trades;
        uint256 bestTradeBps;
        uint256 timestamp;
        bytes32 proofHash;
    }

    struct LeaderboardEntry {
        address player;
        uint256 totalScoreBps;
        uint256 gamesPlayed;
        uint256 bestGameBps;
        uint256 lastPlayed;
    }

    mapping(address => GameSession[]) public playerSessions;
    mapping(address => LeaderboardEntry) public leaderboard;
    address[] public topPlayers;

    address public owner;
    bool public paused;
    uint256 public constant MAX_LEADERBOARD_RETURN = 50;
    uint256 public totalGamesPlayed;

    event GameSubmitted(
        address indexed player,
        uint256 indexed sessionId,
        uint256 scoreBps,
        uint256 trades,
        uint256 timestamp,
        bytes32 proofHash
    );
    event PlayerRegistered(address indexed player, uint256 timestamp);
    event ContractPaused(address indexed by);
    event ContractUnpaused(address indexed by);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "FXBlitz: not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "FXBlitz: paused");
        _;
    }

    constructor() {
        owner = msg.sender;
        paused = false;
    }

    function submitGame(
        uint256 scoreBps,
        uint256 trades,
        uint256 bestTradeBps,
        bytes32 proofHash
    ) external whenNotPaused {
        require(trades > 0, "FXBlitz: no trades");
        require(trades <= 1000, "FXBlitz: too many trades");

        uint256 sessionId = playerSessions[msg.sender].length;

        playerSessions[msg.sender].push(
            GameSession(msg.sender, scoreBps, trades, bestTradeBps, block.timestamp, proofHash)
        );
        totalGamesPlayed++;

        LeaderboardEntry storage entry = leaderboard[msg.sender];
        if (entry.player == address(0)) {
            entry.player = msg.sender;
            topPlayers.push(msg.sender);
            emit PlayerRegistered(msg.sender, block.timestamp);
        }

        entry.totalScoreBps += scoreBps;
        entry.gamesPlayed += 1;
        if (scoreBps > entry.bestGameBps) entry.bestGameBps = scoreBps;
        entry.lastPlayed = block.timestamp;

        emit GameSubmitted(msg.sender, sessionId, scoreBps, trades, block.timestamp, proofHash);
    }

    function getLeaderboard(uint256 count) external view returns (LeaderboardEntry[] memory) {
        uint256 limit = count > MAX_LEADERBOARD_RETURN ? MAX_LEADERBOARD_RETURN : count;
        if (limit > topPlayers.length) limit = topPlayers.length;

        LeaderboardEntry[] memory result = new LeaderboardEntry[](limit);
        if (limit == 0) return result;

        address[] memory sorted = new address[](topPlayers.length);
        for (uint256 i = 0; i < topPlayers.length; i++) sorted[i] = topPlayers[i];

        for (uint256 i = 0; i < sorted.length; i++) {
            for (uint256 j = i + 1; j < sorted.length; j++) {
                if (leaderboard[sorted[j]].totalScoreBps > leaderboard[sorted[i]].totalScoreBps) {
                    (sorted[i], sorted[j]) = (sorted[j], sorted[i]);
                }
            }
        }

        for (uint256 i = 0; i < limit; i++) result[i] = leaderboard[sorted[i]];
        return result;
    }

    function getPlayerSessions(address player) external view returns (GameSession[] memory) {
        return playerSessions[player];
    }

    function getPlayerStats(address player) external view returns (LeaderboardEntry memory) {
        return leaderboard[player];
    }

    function getPlayerCount() external view returns (uint256) {
        return topPlayers.length;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit _paused ? ContractPaused(msg.sender) : ContractUnpaused(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "FXBlitz: zero address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
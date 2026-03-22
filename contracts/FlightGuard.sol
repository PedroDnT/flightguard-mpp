// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FlightGuard
 * @notice Parametric flight delay insurance on Scroll.
 *
 * The off-chain server (owner) is the oracle:
 *   1. registerPolicy()  — after premium is received via MPP
 *   2. triggerPayout()   — when AeroDataBox confirms delay >= threshold
 *   3. expirePolicy()    — when flight departs on time / date passes
 *
 * The contract holds the USDC pool; the server never touches it directly.
 */
contract FlightGuard is Ownable {

    // ----------------------------------------------------------------
    // Types
    // ----------------------------------------------------------------

    enum PolicyStatus { Active, PaidOut, Expired }

    struct Policy {
        address payoutAddress;
        uint256 payoutAmount;   // USDC units (6 decimals)
        PolicyStatus status;
    }

    // ----------------------------------------------------------------
    // State
    // ----------------------------------------------------------------

    IERC20 public immutable usdc;

    /// @dev policyId = keccak256(abi.encodePacked(uuid)) computed off-chain
    mapping(bytes32 => Policy) public policies;

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    event PolicyRegistered(bytes32 indexed policyId, address indexed payoutAddress, uint256 payoutAmount);
    event PayoutTriggered(bytes32 indexed policyId, address indexed payoutAddress, uint256 amount);
    event PolicyExpired(bytes32 indexed policyId);
    event PoolFunded(address indexed funder, uint256 amount);
    event PoolWithdrawn(uint256 amount);

    // ----------------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------------

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
    }

    // ----------------------------------------------------------------
    // Owner (server oracle) functions
    // ----------------------------------------------------------------

    /**
     * @notice Register a policy after the premium is received off-chain.
     * @param policyId      keccak256 of the UUID string
     * @param payoutAddress Policyholder's wallet
     * @param payoutAmount  Amount in USDC units (e.g. 5_000_000 = 5 USDC)
     */
    function registerPolicy(
        bytes32 policyId,
        address payoutAddress,
        uint256 payoutAmount
    ) external onlyOwner {
        require(policies[policyId].payoutAddress == address(0), "Policy already exists");
        require(payoutAddress != address(0), "Invalid payout address");
        require(payoutAmount > 0, "Payout amount must be > 0");
        require(usdc.balanceOf(address(this)) >= payoutAmount, "Insufficient pool balance");

        policies[policyId] = Policy({
            payoutAddress: payoutAddress,
            payoutAmount: payoutAmount,
            status: PolicyStatus.Active
        });

        emit PolicyRegistered(policyId, payoutAddress, payoutAmount);
    }

    /**
     * @notice Trigger a payout when the flight delay threshold is confirmed.
     * @param policyId keccak256 of the UUID string
     */
    function triggerPayout(bytes32 policyId) external onlyOwner {
        Policy storage policy = policies[policyId];
        require(policy.payoutAddress != address(0), "Policy not found");
        require(policy.status == PolicyStatus.Active, "Policy not active");

        policy.status = PolicyStatus.PaidOut;

        require(usdc.transfer(policy.payoutAddress, policy.payoutAmount), "USDC transfer failed");

        emit PayoutTriggered(policyId, policy.payoutAddress, policy.payoutAmount);
    }

    /**
     * @notice Mark a policy as expired (flight on time or date passed).
     * @param policyId keccak256 of the UUID string
     */
    function expirePolicy(bytes32 policyId) external onlyOwner {
        Policy storage policy = policies[policyId];
        require(policy.payoutAddress != address(0), "Policy not found");
        require(policy.status == PolicyStatus.Active, "Policy not active");

        policy.status = PolicyStatus.Expired;

        emit PolicyExpired(policyId);
    }

    // ----------------------------------------------------------------
    // Pool management
    // ----------------------------------------------------------------

    /**
     * @notice Fund the pool with USDC. Caller must approve this contract first.
     * @param amount USDC units to deposit
     */
    function fund(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        emit PoolFunded(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDC from the pool (owner only).
     * @param amount USDC units to withdraw
     */
    function withdraw(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be > 0");
        require(usdc.transfer(owner(), amount), "USDC transfer failed");
        emit PoolWithdrawn(amount);
    }

    // ----------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------

    /// @notice Current USDC balance held by this contract.
    function poolBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Fetch a policy by its bytes32 ID.
    function getPolicy(bytes32 policyId) external view returns (Policy memory) {
        return policies[policyId];
    }
}

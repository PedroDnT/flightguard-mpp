const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Helper: convert UUID string to bytes32 the same way the server will
function uuidToBytes32(uuid) {
  return ethers.keccak256(ethers.toUtf8Bytes(uuid));
}

// USDC has 6 decimals
const USDC = (n) => ethers.parseUnits(String(n), 6);

describe("FlightGuard", function () {
  // ----------------------------------------------------------------
  // Fixture
  // ----------------------------------------------------------------
  async function deployFixture() {
    const [owner, funder, policyholder, stranger] = await ethers.getSigners();

    // Deploy a minimal ERC-20 mock for USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Deploy FlightGuard
    const FlightGuard = await ethers.getContractFactory("FlightGuard");
    const fg = await FlightGuard.deploy(await usdc.getAddress());

    // Mint USDC to funder and fund the pool
    await usdc.mint(funder.address, USDC(1000));
    await usdc.connect(funder).approve(await fg.getAddress(), USDC(1000));
    await fg.connect(funder).fund(USDC(100));

    return { fg, usdc, owner, funder, policyholder, stranger };
  }

  // ----------------------------------------------------------------
  // Deployment
  // ----------------------------------------------------------------
  describe("Deployment", function () {
    it("sets the deployer as owner", async function () {
      const { fg, owner } = await loadFixture(deployFixture);
      expect(await fg.owner()).to.equal(owner.address);
    });

    it("sets the USDC token address", async function () {
      const { fg, usdc } = await loadFixture(deployFixture);
      expect(await fg.usdc()).to.equal(await usdc.getAddress());
    });

    it("reverts if USDC is zero address", async function () {
      const FlightGuard = await ethers.getContractFactory("FlightGuard");
      await expect(
        FlightGuard.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid USDC address");
    });
  });

  // ----------------------------------------------------------------
  // Pool funding
  // ----------------------------------------------------------------
  describe("fund()", function () {
    it("increases pool balance", async function () {
      const { fg, usdc, funder } = await loadFixture(deployFixture);
      const before = await fg.poolBalance();
      await usdc.connect(funder).approve(await fg.getAddress(), USDC(50));
      await fg.connect(funder).fund(USDC(50));
      expect(await fg.poolBalance()).to.equal(before + USDC(50));
    });

    it("emits PoolFunded event", async function () {
      const { fg, usdc, funder } = await loadFixture(deployFixture);
      await usdc.connect(funder).approve(await fg.getAddress(), USDC(10));
      await expect(fg.connect(funder).fund(USDC(10)))
        .to.emit(fg, "PoolFunded")
        .withArgs(funder.address, USDC(10));
    });

    it("reverts on zero amount", async function () {
      const { fg } = await loadFixture(deployFixture);
      await expect(fg.fund(0)).to.be.revertedWith("Amount must be > 0");
    });
  });

  // ----------------------------------------------------------------
  // registerPolicy()
  // ----------------------------------------------------------------
  describe("registerPolicy()", function () {
    it("registers a policy and emits event", async function () {
      const { fg, owner, policyholder } = await loadFixture(deployFixture);
      const pid = uuidToBytes32("abc-123");

      await expect(
        fg.connect(owner).registerPolicy(pid, policyholder.address, USDC(5))
      )
        .to.emit(fg, "PolicyRegistered")
        .withArgs(pid, policyholder.address, USDC(5));

      const policy = await fg.getPolicy(pid);
      expect(policy.payoutAddress).to.equal(policyholder.address);
      expect(policy.payoutAmount).to.equal(USDC(5));
      expect(policy.status).to.equal(0); // Active
    });

    it("reverts if not owner", async function () {
      const { fg, stranger, policyholder } = await loadFixture(deployFixture);
      const pid = uuidToBytes32("abc-999");
      await expect(
        fg.connect(stranger).registerPolicy(pid, policyholder.address, USDC(5))
      ).to.be.revertedWithCustomError(fg, "OwnableUnauthorizedAccount");
    });

    it("reverts on duplicate policyId", async function () {
      const { fg, owner, policyholder } = await loadFixture(deployFixture);
      const pid = uuidToBytes32("dup-001");
      await fg.connect(owner).registerPolicy(pid, policyholder.address, USDC(5));
      await expect(
        fg.connect(owner).registerPolicy(pid, policyholder.address, USDC(5))
      ).to.be.revertedWith("Policy already exists");
    });

    it("reverts if pool has insufficient balance", async function () {
      const { fg, owner, policyholder } = await loadFixture(deployFixture);
      const pid = uuidToBytes32("big-001");
      await expect(
        fg.connect(owner).registerPolicy(pid, policyholder.address, USDC(99999))
      ).to.be.revertedWith("Insufficient pool balance");
    });

    it("reverts on zero payout amount", async function () {
      const { fg, owner, policyholder } = await loadFixture(deployFixture);
      const pid = uuidToBytes32("zero-001");
      await expect(
        fg.connect(owner).registerPolicy(pid, policyholder.address, 0)
      ).to.be.revertedWith("Payout amount must be > 0");
    });
  });

  // ----------------------------------------------------------------
  // triggerPayout()
  // ----------------------------------------------------------------
  describe("triggerPayout()", function () {
    async function withActivePolicy(fixture) {
      const { fg, owner, policyholder } = fixture;
      const pid = uuidToBytes32("flight-001");
      await fg.connect(owner).registerPolicy(pid, policyholder.address, USDC(5));
      return pid;
    }

    it("transfers USDC to policyholder and emits event", async function () {
      const ctx = await loadFixture(deployFixture);
      const { fg, usdc, owner, policyholder } = ctx;
      const pid = await withActivePolicy(ctx);

      const before = await usdc.balanceOf(policyholder.address);
      await expect(fg.connect(owner).triggerPayout(pid))
        .to.emit(fg, "PayoutTriggered")
        .withArgs(pid, policyholder.address, USDC(5));

      expect(await usdc.balanceOf(policyholder.address)).to.equal(before + USDC(5));
    });

    it("sets policy status to PaidOut", async function () {
      const ctx = await loadFixture(deployFixture);
      const { fg, owner } = ctx;
      const pid = await withActivePolicy(ctx);
      await fg.connect(owner).triggerPayout(pid);
      const policy = await fg.getPolicy(pid);
      expect(policy.status).to.equal(1); // PaidOut
    });

    it("reverts on second payout attempt", async function () {
      const ctx = await loadFixture(deployFixture);
      const { fg, owner } = ctx;
      const pid = await withActivePolicy(ctx);
      await fg.connect(owner).triggerPayout(pid);
      await expect(fg.connect(owner).triggerPayout(pid)).to.be.revertedWith(
        "Policy not active"
      );
    });

    it("reverts if policy not found", async function () {
      const { fg, owner } = await loadFixture(deployFixture);
      const pid = uuidToBytes32("nonexistent");
      await expect(fg.connect(owner).triggerPayout(pid)).to.be.revertedWith(
        "Policy not found"
      );
    });

    it("reverts if not owner", async function () {
      const ctx = await loadFixture(deployFixture);
      const { fg, stranger } = ctx;
      const pid = await withActivePolicy(ctx);
      await expect(fg.connect(stranger).triggerPayout(pid)).to.be.revertedWithCustomError(
        fg,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  // ----------------------------------------------------------------
  // expirePolicy()
  // ----------------------------------------------------------------
  describe("expirePolicy()", function () {
    it("marks policy as Expired and emits event", async function () {
      const { fg, owner, policyholder } = await loadFixture(deployFixture);
      const pid = uuidToBytes32("expire-001");
      await fg.connect(owner).registerPolicy(pid, policyholder.address, USDC(5));

      await expect(fg.connect(owner).expirePolicy(pid))
        .to.emit(fg, "PolicyExpired")
        .withArgs(pid);

      const policy = await fg.getPolicy(pid);
      expect(policy.status).to.equal(2); // Expired
    });

    it("reverts if already paid out", async function () {
      const { fg, owner, policyholder } = await loadFixture(deployFixture);
      const pid = uuidToBytes32("expire-002");
      await fg.connect(owner).registerPolicy(pid, policyholder.address, USDC(5));
      await fg.connect(owner).triggerPayout(pid);
      await expect(fg.connect(owner).expirePolicy(pid)).to.be.revertedWith(
        "Policy not active"
      );
    });
  });

  // ----------------------------------------------------------------
  // withdraw()
  // ----------------------------------------------------------------
  describe("withdraw()", function () {
    it("sends USDC to owner", async function () {
      const { fg, usdc, owner } = await loadFixture(deployFixture);
      const before = await usdc.balanceOf(owner.address);
      await fg.connect(owner).withdraw(USDC(10));
      expect(await usdc.balanceOf(owner.address)).to.equal(before + USDC(10));
    });

    it("reverts if not owner", async function () {
      const { fg, stranger } = await loadFixture(deployFixture);
      await expect(fg.connect(stranger).withdraw(USDC(1))).to.be.revertedWithCustomError(
        fg,
        "OwnableUnauthorizedAccount"
      );
    });
  });
});

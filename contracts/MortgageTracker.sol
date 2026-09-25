// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MortgageTracker — the loan's source of truth, on-chain.
/// @notice An amortizing mortgage ledger: outstanding balance, interest
///         accrual, late fees, and delinquency are all verifiable on-chain.
///         The monthly payment is computed OFF-CHAIN with the standard
///         amortization formula and passed to the constructor — garbage in,
///         garbage out. This contract has not been audited; do not use it
///         with real funds until it has been reviewed.
contract MortgageTracker is ReentrancyGuard {
    uint256 private constant MONTH = 30 days;
    uint256 private constant BPS = 10_000;

    address public immutable borrower;
    address public immutable lender;
    uint256 public immutable principal; // original principal, wei
    uint256 public immutable annualRateBps; // e.g. 650 = 6.5%
    uint256 public immutable termMonths;
    uint256 public immutable monthlyPayment; // wei, computed off-chain
    uint256 public immutable gracePeriod; // seconds
    uint256 public immutable lateFeeBps = 500; // 5% of one monthly payment
    uint256 public immutable startTimestamp;

    uint256 public outstandingPrincipal;
    uint256 public totalPaid;
    uint256 public totalInterestPaid;
    uint256 public totalLateFeesPaid;
    uint256 public paymentsMade;
    uint256 public nextDueDate;
    uint256 public lastAccrualTimestamp;
    uint256 public unpaidLateFees;
    bool public paidOff;

    event PaymentRecorded(
        uint256 principalPortion,
        uint256 interestPortion,
        uint256 lateFee
    );
    event LoanPaidOff();

    error OnlyBorrower();
    error LoanAlreadyPaidOff();
    error ZeroPayment();

    modifier onlyBorrower() {
        if (msg.sender != borrower) revert OnlyBorrower();
        _;
    }

    constructor(
        address _borrower,
        address _lender,
        uint256 _principal,
        uint256 _annualRateBps,
        uint256 _termMonths,
        uint256 _monthlyPayment,
        uint256 _gracePeriodDays
    ) {
        require(_borrower != address(0) && _lender != address(0), "zero address");
        require(_principal > 0, "zero principal");
        require(_monthlyPayment > 0, "zero payment");
        require(_termMonths > 0, "zero term");

        borrower = _borrower;
        lender = _lender;
        principal = _principal;
        annualRateBps = _annualRateBps;
        termMonths = _termMonths;
        monthlyPayment = _monthlyPayment;
        gracePeriod = _gracePeriodDays * 1 days;
        startTimestamp = block.timestamp;

        outstandingPrincipal = _principal;
        lastAccrualTimestamp = block.timestamp;
        nextDueDate = block.timestamp + MONTH;
    }

    /// @notice Interest accrued but not yet applied, in wei.
    function pendingInterest() public view returns (uint256) {
        uint256 monthsElapsed = (block.timestamp - lastAccrualTimestamp) / MONTH;
        return (outstandingPrincipal * annualRateBps * monthsElapsed) / BPS / 12;
    }

    /// @notice True while the loan is live and past due date + grace period.
    function isDelinquent() public view returns (bool) {
        return !paidOff && block.timestamp > nextDueDate + gracePeriod;
    }

    /// @notice Make a mortgage payment. Waterfall: late fees -> interest -> principal.
    ///         Any amount over what is owed is refunded to the borrower.
    function recordPayment() external payable onlyBorrower nonReentrant {
        if (paidOff) revert LoanAlreadyPaidOff();
        if (msg.value == 0) revert ZeroPayment();

        // 1. Accrue interest for each full elapsed month since last accrual.
        uint256 monthsElapsed = (block.timestamp - lastAccrualTimestamp) / MONTH;
        uint256 interestDue = (outstandingPrincipal * annualRateBps * monthsElapsed) / BPS / 12;
        if (monthsElapsed > 0) {
            lastAccrualTimestamp += monthsElapsed * MONTH;
        }

        // 2. Late fee when past the due date + grace period.
        uint256 lateFeeAssessed = 0;
        if (block.timestamp > nextDueDate + gracePeriod) {
            lateFeeAssessed = (monthlyPayment * lateFeeBps) / BPS;
            unpaidLateFees += lateFeeAssessed;
        }

        // 3. Waterfall the payment across what is owed.
        uint256 remaining = msg.value;

        uint256 lateFeePortion = _min(remaining, unpaidLateFees);
        unpaidLateFees -= lateFeePortion;
        totalLateFeesPaid += lateFeePortion;
        remaining -= lateFeePortion;

        uint256 interestPortion = _min(remaining, interestDue);
        totalInterestPaid += interestPortion;
        remaining -= interestPortion;

        uint256 principalPortion = _min(remaining, outstandingPrincipal);
        outstandingPrincipal -= principalPortion;
        remaining -= principalPortion;

        paymentsMade += 1;
        nextDueDate += MONTH;

        uint256 toLender = msg.value - remaining;
        totalPaid += toLender;

        emit PaymentRecorded(principalPortion, interestPortion, lateFeePortion);

        if (outstandingPrincipal == 0) {
            paidOff = true;
            emit LoanPaidOff();
        }

        // 4. Effects done — forward funds, refund any excess.
        (bool okLender, ) = lender.call{value: toLender}("");
        require(okLender, "lender transfer failed");
        if (remaining > 0) {
            (bool okRefund, ) = borrower.call{value: remaining}("");
            require(okRefund, "refund failed");
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}

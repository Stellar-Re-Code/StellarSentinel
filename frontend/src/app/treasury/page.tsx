export default function TreasuryPage() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Treasury</h1>
          <p className="text-gray-400 mt-1">
            Manage shared funds with multi-signature approvals
          </p>
        </div>
        {/* TODO: [FE-7] Add Deposit Modal trigger */}
        <button className="btn-primary">+ Deposit</button>
      </div>

      {/* Balance Overview */}
      {/* TODO: [FE-11] Implement real balance from Soroban contract */}
      <div className="card">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-400">Total Balance</p>
            <p className="text-4xl font-bold text-white mt-1">— XLM</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Approval Threshold</p>
            <p className="text-2xl font-semibold text-primary-400 mt-1">
              — of —
            </p>
          </div>
        </div>
      </div>

      {/* Pending Transactions */}
      {/* TODO: [FE-8] Implement withdrawal proposal form */}
      {/* TODO: [FE-9] Implement approval button */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">
          Pending Transactions
        </h2>
        <div className="card">
          <p className="text-gray-500 text-center py-8">
            Connect your wallet to view pending transactions
          </p>
        </div>
      </div>

      {/* Transaction History */}
      {/* TODO: [FE-10] Implement transaction history table */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">History</h2>
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-stellar-border">
                  <th className="text-left py-3 px-4">ID</th>
                  <th className="text-left py-3 px-4">To</th>
                  <th className="text-left py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Approvals</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={5}
                    className="text-center text-gray-500 py-8"
                  >
                    No transactions yet
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

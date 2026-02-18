export default function GovernancePage() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Governance</h1>
          <p className="text-gray-400 mt-1">
            Create and vote on proposals for your organization
          </p>
        </div>
        {/* TODO: [FE-14] Add Create Proposal Modal trigger */}
        <button className="btn-primary">+ New Proposal</button>
      </div>

      {/* Governance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-sm text-gray-400">Total Proposals</p>
          <p className="text-2xl font-bold text-white mt-1">—</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-400">Active</p>
          <p className="text-2xl font-bold text-green-400 mt-1">—</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-400">Quorum %</p>
          <p className="text-2xl font-bold text-primary-400 mt-1">—</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-400">Members</p>
          <p className="text-2xl font-bold text-white mt-1">—</p>
        </div>
      </div>

      {/* Proposal List */}
      {/* TODO: [FE-13] Implement proposal list with real data */}
      {/* TODO: [FE-16] Add vote casting UI */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">
          Active Proposals
        </h2>
        <div className="space-y-4">
          {/* Placeholder Proposal Card */}
          <div className="card">
            <p className="text-gray-500 text-center py-8">
              Connect your wallet to view proposals
            </p>
          </div>
        </div>
      </div>

      {/* Past Proposals */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">
          Past Proposals
        </h2>
        <div className="card">
          <p className="text-gray-500 text-center py-8">
            No past proposals
          </p>
        </div>
      </div>
    </div>
  );
}

import { useAuthStore } from '../stores/auth.store';

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-gray-600">Welcome back, {user?.name}</p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Active Workflows" value="--" description="No workflows yet" />
        <StatCard title="Running Instances" value="--" description="No instances yet" />
        <StatCard title="Pending Tasks" value="--" description="No tasks yet" />
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Getting Started</h2>
        <p className="mt-2 text-sm text-gray-600">
          Your FlowEngine workspace is ready. In the next phase, you'll be able to:
        </p>
        <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-gray-600">
          <li>Design workflows with the visual BPMN editor</li>
          <li>Start workflow instances and track execution</li>
          <li>Claim and complete tasks from your inbox</li>
          <li>Monitor SLA compliance and audit trails</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

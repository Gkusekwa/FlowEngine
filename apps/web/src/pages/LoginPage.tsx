import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { api } from '../services/api';

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

type Step = 'email' | 'password';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<TenantOption | null>(null);
  const [error, setError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLookupLoading(true);

    try {
      const { data } = await api.post<{ success: boolean; data: { tenants: TenantOption[] } }>(
        '/auth/lookup',
        { email },
      );

      const found = data.data.tenants;

      if (found.length === 0) {
        setError('No account found with this email');
        return;
      }

      setTenants(found);
      setSelectedTenant(found[0]);
      setStep('password');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedTenant) return;

    try {
      await login(email, password, selectedTenant.slug);
      navigate('/');
    } catch {
      setError('Invalid password');
    }
  };

  const handleBack = () => {
    setStep('email');
    setPassword('');
    setError('');
    setTenants([]);
    setSelectedTenant(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">FlowEngine</h1>
          <p className="mt-2 text-gray-600">Sign in to your account</p>
        </div>

        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <button
                type="submit"
                disabled={lookupLoading}
                className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {lookupLoading ? 'Looking up...' : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit}>
              <div className="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm text-gray-600">{email}</span>
              </div>

              <div className="space-y-4">
                {tenants.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Organization
                    </label>
                    <div className="mt-2 space-y-2">
                      {tenants.map((t) => (
                        <label
                          key={t.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                            selectedTenant?.id === t.id
                              ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="tenant"
                            checked={selectedTenant?.id === t.id}
                            onChange={() => setSelectedTenant(t)}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{t.name}</p>
                            <p className="text-xs text-gray-500">{t.slug}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {tenants.length === 1 && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-900">{tenants[0].name}</p>
                    <p className="text-xs text-gray-500">{tenants[0].slug}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoFocus
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-primary-600 hover:text-primary-500">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

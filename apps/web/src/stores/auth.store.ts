import { create } from 'zustand';
import { api } from '../services/api';
import type { LoginResponse, UserProfile, TenantSummary } from '@flowengine/shared';

interface AuthState {
  user: UserProfile | null;
  tenant: TenantSummary | null;
  availableTenants: TenantSummary[];
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string, tenantSlug: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  switchTenant: (tenantSlug: string) => Promise<void>;
  loadAvailableTenants: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tenant: null,
  availableTenants: [],
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,

  login: async (email: string, password: string, tenantSlug: string) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post<{ success: boolean; data: LoginResponse }>('/auth/login', {
        email,
        password,
        tenantSlug,
      });

      const result = data.data;

      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);
      localStorage.setItem('tenantSlug', result.tenant.slug);

      set({
        user: result.user,
        tenant: result.tenant,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
      throw new Error('Invalid credentials');
    }
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tenantSlug');
      set({ user: null, tenant: null, isAuthenticated: false });
    }
  },

  loadUser: async () => {
    if (!localStorage.getItem('accessToken')) {
      set({ isAuthenticated: false });
      return;
    }

    set({ isLoading: true });
    try {
      const { data } = await api.get<{ success: boolean; data: UserProfile & { tenantId: string; tenantSlug: string } }>('/auth/me');
      const result = data.data;

      set({
        user: {
          id: result.id,
          email: result.email,
          name: result.name,
          role: result.role,
          permissions: result.permissions,
          groups: result.groups,
        },
        tenant: {
          id: result.tenantId,
          name: '', // Will be populated from tenant endpoint
          slug: result.tenantSlug,
        },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ user: null, tenant: null, isAuthenticated: false, isLoading: false });
    }
  },

  switchTenant: async (tenantSlug: string) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post<{ success: boolean; data: LoginResponse }>('/auth/switch-tenant', {
        tenantSlug,
      });

      const result = data.data;

      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);
      localStorage.setItem('tenantSlug', result.tenant.slug);

      set({
        user: result.user,
        tenant: result.tenant,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
      throw new Error('Failed to switch tenant');
    }
  },

  loadAvailableTenants: async () => {
    const user = get().user;
    if (!user) return;

    try {
      const { data } = await api.post<{ success: boolean; data: { tenants: TenantSummary[] } }>('/auth/lookup', {
        email: user.email,
      });
      set({ availableTenants: data.data.tenants });
    } catch {
      // Ignore errors loading tenant list
    }
  },
}));

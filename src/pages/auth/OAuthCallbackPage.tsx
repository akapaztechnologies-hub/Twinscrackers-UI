import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, postLoginPath } from '@/store/auth.ts';
import { getMe } from '@/services/auth.ts';

const TOKENS_KEY = 'akash-crackers-tokens';
const REDIRECT_KEY = 'akash-crackers-oauth-redirect';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (!accessToken || !refreshToken) {
      navigate('/login', { replace: true });
      return;
    }

    // Store tokens
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ accessToken, refreshToken }));

    // Fetch user profile and redirect
    getMe()
      .then((user) => {
        setUser(user);
        const redirectPath = postLoginPath(user, localStorage.getItem(REDIRECT_KEY));
        localStorage.removeItem(REDIRECT_KEY);
        navigate(redirectPath, { replace: true });
      })
      .catch(() => {
        navigate('/login', { replace: true });
      });
  }, [searchParams, navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-3 border-brand-500 border-t-transparent animate-spin" />
        <p className="text-body-sm text-surface-500 font-medium">Signing you in...</p>
      </div>
    </div>
  );
}

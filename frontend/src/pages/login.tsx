import { useState } from 'react';
import { useRouter } from 'next/router';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Card, Button, Input, Alert } from '@/components/ui';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const res = await login(username, password);
    if (!res.ok) setError(res.error || 'Login failed');
    else router.push('/');
  };

  return (
    <Card className="max-w-md mx-auto p-6">
      <h3 className="text-lg font-semibold mb-4">Login</h3>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="space-y-3">
        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <Button onClick={submit} fullWidth>Login</Button>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <div className="py-12">
        <LoginForm />
      </div>
    </AuthProvider>
  );
}

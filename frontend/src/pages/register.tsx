import { useState } from 'react';
import { useRouter } from 'next/router';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Card, Button, Input, Alert } from '@/components/ui';

function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const res = await register(username, password, region || undefined);
    if (!res.ok) setError(res.error || 'Register failed');
    else router.push('/');
  };

  return (
    <Card className="max-w-md mx-auto p-6">
      <h3 className="text-lg font-semibold mb-4">Register</h3>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="space-y-3">
        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region (state)" />
        <Button onClick={submit} fullWidth>Create account</Button>
      </div>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <AuthProvider>
      <div className="py-12">
        <RegisterForm />
      </div>
    </AuthProvider>
  );
}

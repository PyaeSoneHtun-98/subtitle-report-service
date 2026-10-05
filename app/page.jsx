import { connection } from 'next/server';
import Dashboard from '../components/Dashboard';
export default async function Page() {
  await connection();
  return <Dashboard />;
}

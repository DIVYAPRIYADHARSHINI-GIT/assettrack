import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui';

export default function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState icon={Compass} title="Page not found" message="The page you are looking for does not exist or was moved." action={<Link className="btn-primary" to="/">Back to dashboard</Link>} />
    </div>
  );
}

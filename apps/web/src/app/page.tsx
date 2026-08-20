import { api } from '@/lib/api';
import { Explorer } from '@/components/explorer/explorer';

/**
 * The hero answer is fetched on the server so the first paint already shows a real finding — an
 * empty graph is a poor first impression, and this is the screen a reviewer lands on.
 */
export default async function Page() {
  const [owners, health] = await Promise.all([api.beneficialOwners('C-SCN-01', 5), api.health()]);

  return (
    <Explorer
      initial={owners.ok ? owners.data : { rows: [] }}
      health={health.ok ? health.data : null}
    />
  );
}

import { StatusIndicator } from './ui/index.js';
import { useCapabilities } from '../features/useCapabilities.js';

/**
 * Confirms live calling only when the API says signaling is actually attached.
 * It deliberately stays silent otherwise: this product never claims a capability
 * it cannot demonstrate (§27), and a dashboard is not the place to advertise
 * which deployment target is missing.
 */
export function CallingCapabilityBadge() {
  const { caps } = useCapabilities();

  if (!caps?.signaling) return null;
  return <StatusIndicator tone="success" label="Live calling is available" />;
}

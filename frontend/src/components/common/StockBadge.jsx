import { AlertTriangle, CheckCircle2, Layers, PackageX } from 'lucide-react';
import { Badge } from './ui';
import { STOCK_META, stockStatus } from '../../utils/stock';
import { useI18n } from '../../i18n';

const ICONS = { out: PackageX, low: AlertTriangle, over: Layers, ok: CheckCircle2 };

export default function StockBadge({ product, status }) {
  const { t } = useI18n();
  const s = status || stockStatus(product);
  const meta = STOCK_META[s];
  return <Badge tone={meta.tone} icon={ICONS[s]}>{t(meta.label)}</Badge>;
}

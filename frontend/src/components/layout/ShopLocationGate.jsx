import { Suspense, lazy, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin } from 'lucide-react';
import { profileApi } from '../../api/profile.api';
import { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { haptic } from '../../telegram';
import { isStaff } from '../../utils/plans';
import Modal from '../common/Modal';
import { Button, Skeleton } from '../common/ui';
// Leaflet loads only when the picker is actually needed.
const LocationPicker = lazy(() => import('../map/LocationPicker'));

/**
 * Shop owners must mark their shop on the map once (right after sign-up, and existing owners
 * on their next visit). Sellers and the admin are never asked.
 */
export default function ShopLocationGate() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const [point, setPoint] = useState(null);
  const [saving, setSaving] = useState(false);
  const needed = !!user && user.role === 'user' && !isStaff(user) && !user.shopLocation;
  if (!needed) return null;

  const save = async () => {
    setSaving(true);
    try {
      const { user: updated } = await profileApi.update({ shopLocation: point });
      setUser(updated);
      haptic('success');
      toast.success(t('shops.saved'));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open dismissable={false} size="lg" onClose={() => {}}
      title={t('shops.gateTitle')}
      description={t('shops.gateDesc')}
      footer={<Button icon={MapPin} loading={saving} disabled={!point} onClick={save}>{t('shops.save')}</Button>}
    >
      <Suspense fallback={<Skeleton className="h-64 sm:h-80" />}>
        <LocationPicker value={point} onChange={setPoint} heightClass="h-64 sm:h-80" />
      </Suspense>
    </Modal>
  );
}

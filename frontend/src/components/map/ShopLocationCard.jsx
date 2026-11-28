import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapPin, Save } from 'lucide-react';
import { profileApi } from '../../api/profile.api';
import { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { haptic } from '../../telegram';
import { Button, Card, CardHeader } from '../common/ui';
import LocationPicker from './LocationPicker';

const same = (a, b) => (a?.lat ?? null) === (b?.lat ?? null) && (a?.lng ?? null) === (b?.lng ?? null) && (a?.address || '') === (b?.address || '');

/** Profile: change where the shop is on the map. */
export default function ShopLocationCard() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const [point, setPoint] = useState(user?.shopLocation || null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPoint(user?.shopLocation || null); }, [user?.shopLocation]);

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
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {t('shops.cardTitle')}</span>}
        subtitle={t('shops.cardSub')}
        action={<Link to="/shops" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">{t('shops.onMap')}</Link>}
      />
      <div className="space-y-4 p-5">
        <LocationPicker value={point} onChange={setPoint} heightClass="h-64" />
        <div className="flex justify-end">
          <Button icon={Save} loading={saving} disabled={!point || same(point, user?.shopLocation)} onClick={save}>{t('shops.save')}</Button>
        </div>
      </div>
    </Card>
  );
}

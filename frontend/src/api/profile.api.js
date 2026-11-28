import api, { unwrap } from './axios';
import { toUser } from './backend';

const real = {
  /** { firstName, lastName, phone, businessName, avatarUrl } -> { user } */
  update: (f) => {
    const body = {};
    if (f.firstName !== undefined) body.first_name = String(f.firstName).trim();
    if (f.lastName !== undefined) body.last_name = String(f.lastName).trim();
    if (f.phone !== undefined) body.phone = String(f.phone).trim();
    if (f.businessName !== undefined) body.business_name = String(f.businessName).trim();
    if (f.avatarUrl !== undefined) body.avatar_url = f.avatarUrl || null;
    if (f.shopLocation !== undefined) {
      body.shop_lat = f.shopLocation ? Number(f.shopLocation.lat) : null;
      body.shop_lng = f.shopLocation ? Number(f.shopLocation.lng) : null;
      body.shop_address = f.shopLocation?.address ? String(f.shopLocation.address).trim().slice(0, 200) : null;
    }
    if (f.notifyDailyReport !== undefined) body.notify_daily_report = !!f.notifyDailyReport;
    if (f.notifyLowStock !== undefined) body.notify_low_stock = !!f.notifyLowStock;
    return api.patch('/profile', body).then(unwrap).then((d) => ({ user: toUser(d.user) }));
  },
  changePassword: ({ currentPassword, newPassword }) =>
    api.post('/profile/password', { current_password: currentPassword, new_password: newPassword }).then(unwrap),
};

export const profileApi = real;

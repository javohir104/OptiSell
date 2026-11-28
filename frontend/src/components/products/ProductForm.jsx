import { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import Modal from '../common/Modal';
import BarcodeScanner from '../common/BarcodeScanner';
import { Button, Input } from '../common/ui';
import { useI18n } from '../../i18n';
import { currencyLabel } from '../../utils/format';
import { UNITS, allowsFraction } from '../../utils/units';

const EMPTY = { name: '', sku: '', barcode: '', category: '', unit: 'pcs', price: '', cost: '', stock: '', minStock: '', maxStock: '', imageUrl: '', description: '' };

export default function ProductForm({ open, onClose, onSubmit, initial, categories = [] }) {
  const { t } = useI18n();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (open) { setForm(initial ? { ...EMPTY, ...initial } : EMPTY); setErrors({}); }
  }, [open, initial]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const validate = () => {
    const e = {};
    const n = (k) => Number(form[k]);
    if (!form.name.trim()) e.name = t('err.nameRequired');
    if (!form.category.trim()) e.category = t('err.categoryRequired');
    if (form.price === '' || !(n('price') >= 0)) e.price = t('err.price');
    if (form.cost === '' || !(n('cost') >= 0)) e.cost = t('err.cost');
    if (form.stock === '' || !(n('stock') >= 0) || (!allowsFraction(form.unit) && !Number.isInteger(n('stock')))) e.stock = t('err.wholeNumber');
    if (form.minStock !== '' && !(n('minStock') >= 0)) e.minStock = t('err.gte0');
    if (form.maxStock !== '' && form.minStock !== '' && n('maxStock') && n('maxStock') <= n('minStock')) e.maxStock = t('err.maxGtMin');
    if (!e.cost && !e.price && n('cost') > n('price')) e.cost = t('err.costGtPrice');
    if (form.imageUrl && !/^https?:\/\/\S+$/i.test(form.imageUrl.trim())) e.imageUrl = t('err.imageUrl');
    if (form.barcode && !/^[A-Za-z0-9.-]+$/.test(form.barcode.trim())) e.barcode = t('field.barcodeHint');
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSubmit({
        ...form, name: form.name.trim(), category: form.category.trim(),
        price: Number(form.price), cost: Number(form.cost), stock: Number(form.stock),
        minStock: Number(form.minStock || 0), maxStock: Number(form.maxStock || 0),
      });
    } finally { setSaving(false); }
  };

  const cur = currencyLabel();

  return (
    <Modal open={open} onClose={onClose} size="lg" title={initial ? t('product.edit') : t('product.add')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="product-form" loading={saving}>{initial ? t('common.saveChanges') : t('product.add')}</Button></>}>
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input className="sm:col-span-2" label={t('field.productName')} name="name" value={form.name} onChange={set('name')} error={errors.name} autoFocus />
        <Input label={t('field.sku')} name="sku" value={form.sku} onChange={set('sku')} hint={t('field.skuHint')} />
        <div className="flex items-end gap-2">
          <Input className="flex-1" label={t('field.barcode')} name="barcode" inputMode="numeric" value={form.barcode || ''} onChange={set('barcode')} error={errors.barcode} hint={t('field.barcodeHint')}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
          <Button variant="secondary" size="icon" className="mb-5" onClick={() => setScanning(true)} aria-label={t('scan.title')}><ScanLine className="h-4 w-4" /></Button>
        </div>
        <div>
          <Input label={t('field.category')} name="category" list="categories" value={form.category} onChange={set('category')} error={errors.category} />
          <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <Input label={`${t('field.sellingPrice')} (${cur})`} name="price" type="number" min="0" step="1" value={form.price} onChange={set('price')} error={errors.price} />
        <Input label={`${t('field.unitCost')} (${cur})`} name="cost" type="number" min="0" step="1" value={form.cost} onChange={set('cost')} error={errors.cost} />
        <Input label={t('field.currentStock')} name="stock" type="number" min="0" step={allowsFraction(form.unit) ? '0.001' : '1'} value={form.stock} onChange={set('stock')} error={errors.stock} />
        <div>
          <Input label={t('field.unit')} name="unit" list="units" value={form.unit} onChange={set('unit')} hint={t('field.unitHint')} />
          <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        </div>
        <Input label={t('field.minStock')} name="minStock" type="number" min="0" value={form.minStock} onChange={set('minStock')} error={errors.minStock} hint={t('field.minStockHint')} />
        <Input label={t('field.maxStock')} name="maxStock" type="number" min="0" value={form.maxStock} onChange={set('maxStock')} error={errors.maxStock} hint={t('field.maxStockHint')} />
        <Input className="sm:col-span-2" label={t('field.imageUrl')} name="imageUrl" type="url" placeholder="https://…" value={form.imageUrl || ''} onChange={set('imageUrl')} error={errors.imageUrl} />
        <div className="sm:col-span-2">
          <label htmlFor="description" className="label">{t('field.description')}</label>
          <textarea id="description" rows={2} className="input" value={form.description} onChange={set('description')} />
        </div>
      </form>
      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={(code) => { setScanning(false); setForm((f) => ({ ...f, barcode: code })); }} />
    </Modal>
  );
}

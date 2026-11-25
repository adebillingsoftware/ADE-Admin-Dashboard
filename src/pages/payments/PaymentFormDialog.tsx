import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import { money } from '@/utils/format';

const schema = z.object({
  shopId: z.string().uuid(),
  amount: z.coerce.number().positive('Amount must be positive.'),
  method: z.enum(['UPI', 'BANK_TRANSFER', 'CASH', 'OTHER']),
  transactionReference: z.string().max(120).optional(),
  paidAt: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function PaymentFormDialog({ shopId, shopName, open, onClose }: { shopId: string; shopName?: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { shopId, method: 'UPI', paidAt: new Date().toISOString().slice(0, 10) },
  });

  useEffect(() => { if (open) reset({ shopId, method: 'UPI', paidAt: new Date().toISOString().slice(0, 10) }); }, [open, shopId, reset]);

  const shops = useQuery({ queryKey: ['shops-for-payment'], queryFn: () => apiGet<Array<{ id: string; shop_code: string; shop_name: string }>>('/shops', { pageSize: 200 }), enabled: open && !shopId });

  if (!open) return null;

  const submit = async (values: FormValues) => {
    try {
      await apiSend('post', '/payments', {
        shopId: values.shopId,
        amountMinor: Math.round(values.amount * 100),
        currencyCode: 'INR',
        method: values.method,
        transactionReference: values.transactionReference || null,
        paidAt: new Date(`${values.paidAt}T00:00:00Z`).toISOString(),
        notes: values.notes || null,
      });
      toast.success('Payment recorded as PENDING. Verify it to allocate the amount.');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to record payment.');
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit(submit)} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Record payment</h2>
        <p className="mt-1 text-sm text-slate-500">{shopName ?? 'Select a shop'}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {!shopId && <label className="text-sm sm:col-span-2"><span className="font-medium">Shop</span><select {...register('shopId')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"><option value="">Select shop</option>{(shops.data ?? []).map((shop) => <option key={shop.id} value={shop.id}>{shop.shop_code} — {shop.shop_name}</option>)}</select>{errors.shopId && <span className="text-xs text-rose-600">{errors.shopId.message}</span>}</label>}
          <label className="text-sm"><span className="font-medium">Amount (INR)</span><input type="number" step="0.01" {...register('amount')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />{errors.amount && <span className="text-xs text-rose-600">{errors.amount.message}</span>}</label>
          <label className="text-sm"><span className="font-medium">Method</span><select {...register('method')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="OTHER">Other</option></select></label>
          <label className="text-sm"><span className="font-medium">UTR / reference</span><input {...register('transactionReference')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm"><span className="font-medium">Payment date</span><input type="date" {...register('paidAt')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm sm:col-span-2"><span className="font-medium">Internal notes</span><textarea rows={2} {...register('notes')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
        </div>
        <p className="mt-3 text-xs text-slate-500">Stored as integer paise. {money(100)} = ₹1.00</p>
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-4 py-2 text-sm">Cancel</button><button disabled={isSubmitting} className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white">{isSubmitting ? 'Saving…' : 'Record payment'}</button></div>
      </form>
    </div>
  );
}

import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Building2, ImagePlus, LoaderCircle, MapPin, Plus, Trash2, X } from 'lucide-react';
import { createRestaurantRequest } from '../../services/branch.api.js';

interface AddRestaurantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const inputClassName = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const AddRestaurantModal: React.FC<AddRestaurantModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [imageName, setImageName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const close = () => {
    if (saving) return;
    setName('');
    setImage('');
    setImageName('');
    setError('');
    onClose();
  };

  const selectImage = (file?: File) => {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Choose a PNG, JPG, or WebP image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Restaurant image must be 5 MB or smaller.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setReadingImage(true);
    const reader = new FileReader();
    reader.onload = () => {
      setReadingImage(false);
      if (typeof reader.result !== 'string') {
        setError('Unable to read this image. Please choose another file.');
        return;
      }
      setImage(reader.result);
      setImageName(file.name);
      setError('');
    };
    reader.onerror = () => {
      setReadingImage(false);
      setError('Unable to read this image. Please choose another file.');
    };
    reader.readAsDataURL(file);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Enter a restaurant name to continue.');
      return;
    }
    setSaving(true);
    try {
      await createRestaurantRequest({ name: name.trim(), image });
      setName('');
      setImage('');
      setImageName('');
      onCreated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create restaurant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="add-restaurant-title" className="w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-white/70 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="grid md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative flex min-h-52 flex-col justify-between overflow-hidden bg-indigo-700 p-6 text-white md:min-h-[22rem] md:p-8">
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full border border-white/10" />
            <div className="absolute -right-3 -top-3 h-28 w-28 rounded-full border border-white/10" />
            <div className="relative flex items-start justify-between">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <Building2 className="h-6 w-6" />
              </div>
              <button type="button" aria-label="Close dialog" disabled={saving} onClick={close} className="rounded-xl p-2 text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="relative mt-8 md:mt-0">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-200">Restaurant setup · 01</p>
              <h2 id="add-restaurant-title" className="max-w-xs text-2xl font-black leading-tight">Start your restaurant story</h2>
              <p className="mt-3 max-w-xs text-sm leading-6 text-indigo-100">Give your brand a name. You can add each restaurant location as a branch next.</p>
            </div>
            <div className="relative mt-6 hidden items-center gap-2 text-xs font-semibold text-indigo-100 md:flex">
              <MapPin className="h-4 w-4" />
              <span>One restaurant, multiple branch locations</span>
            </div>
          </div>

          <form onSubmit={submit} className="flex flex-col justify-center p-6 md:p-8">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">Create new</p>
              <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white">Restaurant details</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter the name customers will recognize.</p>
            </div>
            {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
            <label htmlFor="restaurant-name" className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">
              Restaurant name <span className="text-rose-500">*</span>
            </label>
            <input id="restaurant-name" autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Riverside Kitchen" className={inputClassName} />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Use the name you want displayed across your admin workspace.</p>

            <div className="mt-5" aria-busy={readingImage}>
              <span className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-300">Restaurant image <span className="font-normal text-slate-400">(optional)</span></span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                aria-label="Upload restaurant image"
                onChange={(event) => {
                  selectImage(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              {image ? (
                <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5 dark:border-indigo-900 dark:bg-indigo-950/20">
                  <img src={image} alt={`${name || 'Restaurant'} preview`} className="h-20 w-20 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Image preview</p>
                    <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">{imageName}</p>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-300">Choose a different image</button>
                  </div>
                  <button type="button" aria-label="Remove restaurant image" onClick={() => { setImage(''); setImageName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3.5 text-left transition hover:border-indigo-400 hover:bg-indigo-50/60 dark:border-slate-700 dark:bg-slate-950/50 dark:hover:bg-indigo-950/20">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><ImagePlus className="h-5 w-5" /></span>
                  <span>
                    <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">Upload a restaurant photo</span>
                    <span className="mt-1 block text-[11px] text-slate-500">PNG, JPG or WebP · up to 5 MB</span>
                  </span>
                </button>
              )}
              {readingImage && <p role="status" className="mt-2 inline-flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Preparing image preview…</p>}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:justify-end">
              <button type="button" disabled={saving} onClick={close} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={saving || readingImage || !name.trim()} className="inline-flex min-w-40 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving || readingImage ? <><LoaderCircle className="h-4 w-4 animate-spin" /> {readingImage ? 'Loading image…' : 'Creating…'}</> : <><Plus className="h-4 w-4" /> Add Restaurant <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
};

export default AddRestaurantModal;

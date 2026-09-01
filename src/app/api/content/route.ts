import { readContentStore, writeContentItems } from '@/lib/content-store';
import type { ContentItem } from '@/lib/content-types';

export const runtime = 'nodejs';

export async function GET() {
  try { return Response.json(await readContentStore()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'READ_FAILED' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const item = await request.json() as ContentItem;
    if (!item.title || !item.scheduledAt || !item.format) return Response.json({ error: 'Campos obligatorios incompletos.' }, { status: 400 });
    const store = await readContentStore();
    const next = { ...item, id: item.id || crypto.randomUUID() };
    await writeContentItems([...store.items, next]);
    return Response.json(next, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'CREATE_FAILED' }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    const item = await request.json() as ContentItem;
    const store = await readContentStore();
    if (!store.items.some((entry) => entry.id === item.id)) return Response.json({ error: 'Publicación no encontrada.' }, { status: 404 });
    await writeContentItems(store.items.map((entry) => entry.id === item.id ? item : entry));
    return Response.json(item);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'UPDATE_FAILED' }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'Falta id.' }, { status: 400 });
    const store = await readContentStore();
    await writeContentItems(store.items.filter((entry) => entry.id !== id));
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'DELETE_FAILED' }, { status: 500 }); }
}

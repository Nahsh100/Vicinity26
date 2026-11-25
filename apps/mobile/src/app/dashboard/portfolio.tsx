import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { MediaRef, PortfolioProject } from '@vicinity/shared';
import { portfolioProjectSchema } from '@vicinity/shared';
import { MediaPicker } from '@/components/MediaPicker';
import { confirmAction } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, ErrorState, InlineError, ListSkeleton, Sheet, TextField, Thumb, Toggle, Txt } from '@/components/ui';
import { useMyPortfolio, useMyProvider } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';

/** Portfolio projects + gallery management. Projects appear on the public profile's Portfolio tab. */
export default function Portfolio() {
  const q = useMyPortfolio();
  const me = useMyProvider();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PortfolioProject | 'new' | null>(null);
  const [gallery, setGallery] = useState<MediaRef[] | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['my-portfolio'] });
    void qc.invalidateQueries({ queryKey: ['my-provider'] });
    void qc.invalidateQueries({ queryKey: ['portfolio'] });
    void qc.invalidateQueries({ queryKey: ['gallery'] });
  };
  const del = useMutation({ mutationFn: (id: string) => api.del(`/providers/me/portfolio/${id}`), onSuccess: refresh });
  const saveGallery = useMutation({ mutationFn: (ids: string[]) => api.put('/providers/me/gallery', { mediaIds: ids }), onSuccess: () => { setGallery(null); refresh(); } });

  const g = gallery ?? me.data?.gallery ?? [];

  return (
    <Screen back title="Portfolio" right={<Button title="Project" icon="add" size="sm" onPress={() => setEditing('new')} />}>
      <View className="gap-4 px-margin">
        <Card className="gap-3">
          <Txt variant="headline-sm">Gallery</Txt>
          <MediaPicker value={g} onChange={setGallery} purpose="PROVIDER_GALLERY" allowVideo max={24} />
          {gallery ? <Button title="Save gallery" size="sm" loading={saveGallery.isPending} onPress={() => saveGallery.mutate(gallery.map((m) => m.id))} /> : null}
          <InlineError message={saveGallery.error ? toApiError(saveGallery.error).message : null} />
        </Card>
        <Txt variant="headline-md">Projects</Txt>
        {q.isLoading ? <ListSkeleton rows={2} /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data?.length === 0 ? <EmptyState icon="photo_library" title="No projects yet" message="Show completed jobs with photos, the location, how long it took and (if you like) the price." action={{ label: 'Add a project', onPress: () => setEditing('new') }} /> : null}
        {q.data?.map((p) => (
          <Card key={p.id} className="flex-row gap-3">
            <Thumb uri={p.media[0]?.url} name={p.title} icon="photo_library" size={72} />
            <View className="flex-1 gap-1">
              <Txt variant="headline-sm">{p.title}</Txt>
              <Txt variant="body-sm" className="text-on-surface-variant">{p.media.length} media{p.locationName ? ` · ${p.locationName}` : ''}</Txt>
              <View className="flex-row gap-2">
                <Button title="Edit" size="sm" kind="secondary" onPress={() => setEditing(p)} />
                <Button title="Delete" size="sm" kind="danger" onPress={() => confirmAction('Delete project?', p.title, () => del.mutate(p.id), 'Delete')} />
              </View>
            </View>
          </Card>
        ))}
        {me.data ? <Button title="See it on my profile" kind="ghost" onPress={() => router.push(`/provider/${me.data!.slug}`)} /> : null}
      </View>
      {editing ? <ProjectSheet project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} /> : null}
    </Screen>
  );
}

function ProjectSheet({ project, onClose, onSaved }: { project: PortfolioProject | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [locationName, setLocationName] = useState(project?.locationName ?? '');
  const [durationText, setDurationText] = useState(project?.durationText ?? '');
  const [price, setPrice] = useState(project?.price != null ? String(project.price) : '');
  const [showPrice, setShowPrice] = useState(project?.price != null);
  const [completedAt, setCompletedAt] = useState(project?.completedAt?.slice(0, 10) ?? '');
  const [media, setMedia] = useState<MediaRef[]>(project?.media ?? []);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (body: unknown) => (project ? api.patch(`/providers/me/portfolio/${project.id}`, body) : api.post('/providers/me/portfolio', body)),
    onSuccess: onSaved,
  });

  const save = () => {
    setErr(null);
    if (completedAt && !/^\d{4}-\d{2}-\d{2}$/.test(completedAt)) return setErr('Use the date format YYYY-MM-DD');
    const parsed = portfolioProjectSchema.safeParse({
      title,
      description,
      locationName,
      durationText,
      price: price ? Number(price) : null,
      showPrice,
      completedAt: completedAt ? new Date(`${completedAt}T12:00:00Z`).toISOString() : null,
      mediaIds: media.map((x) => x.id),
    });
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? 'Check the form');
    m.mutate(parsed.data);
  };

  return (
    <Sheet visible onClose={onClose} title={project ? 'Edit project' : 'New project'} footer={<Button title="Save project" loading={m.isPending} onPress={save} />}>
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Kitchen re-tiling in Kabulonga" />
      <TextField label="Description" multiline value={description} onChangeText={setDescription} />
      <MediaPicker label="Photos & videos" value={media} onChange={setMedia} purpose="PORTFOLIO" allowVideo max={20} />
      <TextField label="Location (optional)" value={locationName} onChangeText={setLocationName} placeholder="Area only, e.g. Kabulonga" />
      <TextField label="Duration (optional)" value={durationText} onChangeText={setDurationText} placeholder="e.g. 3 days" />
      <TextField label="Completed on (optional)" value={completedAt} onChangeText={setCompletedAt} placeholder="YYYY-MM-DD" />
      <TextField label="Price (optional, ZMW)" value={price} onChangeText={(t) => setPrice(t.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
      <Toggle label="Show the price publicly" value={showPrice} onChange={setShowPrice} />
      <InlineError message={err ?? (m.error ? toApiError(m.error).message : null)} />
    </Sheet>
  );
}

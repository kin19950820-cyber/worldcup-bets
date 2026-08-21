-- Make groups private at the database layer too (defense in depth). The app
-- already only surfaces groups you've joined; this restricts direct client
-- reads so a member can only read groups/memberships they belong to.
--
-- Server actions use the service role (which bypasses RLS), so leaderboard
-- aggregation and joining-by-code are unaffected. OPTIONAL hardening.
begin;

-- Groups: readable only by a member (or the creator).
drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups
  for select using (
    created_by = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

-- Memberships: readable only for groups you belong to (or your own rows).
drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.group_members mine
      where mine.group_id = group_members.group_id and mine.user_id = auth.uid()
    )
  );

commit;

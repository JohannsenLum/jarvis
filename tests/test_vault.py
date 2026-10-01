import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'core'))
from jarvis_core import vault, identity, recall


class VaultBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'knowledge'
        self.root.mkdir()
        self.env = patch.dict(os.environ, {'JARVIS_VAULT': str(self.root), 'JARVIS_REPO': str(ROOT), 'JARVIS_HOME': str(Path(self.tmp.name) / 'config')})
        self.env.start()
        self.addCleanup(self.env.stop)
        for name in ['me/profile.md', 'raw/source.md', 'log.md', 'me/_proposals.md']:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('original\n')

    def test_protected_aliases_cannot_replace_files(self):
        for name in ['me/profile.md', 'raw/source.md', 'log.md', 'me/_proposals.md']:
            for alias in [name, './' + name, 'work/../' + name]:
                with self.subTest(alias=alias), self.assertRaises(vault.VaultError):
                    vault.write(alias, 'changed')
            self.assertEqual((self.root / name).read_text(), 'original\n')
        with self.assertRaises(vault.VaultError):
            vault.write('ME/profile.md', 'changed')

    def test_valid_writes_log_and_raw_create(self):
        vault.write('work/project.md', 'First', mode='create', reason='test')
        vault.write('work/project.md', 'Second', mode='append')
        self.assertEqual((self.root / 'work/project.md').read_text(), 'First\nSecond\n')
        self.assertIn('work/project.md: test', (self.root / 'log.md').read_text())
        vault.write('raw/new.md', 'source', mode='create')
        with self.assertRaises(vault.VaultError):
            vault.write('raw/new.md', 'more', mode='append')
        vault.propose('Change focus', why='Owner review required')
        self.assertIn('original', (self.root / 'me/_proposals.md').read_text())

    def test_outside_hidden_and_link_paths_rejected(self):
        outside = Path(self.tmp.name) / 'outside.md'
        outside.write_text('outside marker')
        (self.root / 'link.md').symlink_to(outside)
        (self.root / 'alias.md').symlink_to(self.root / 'me/profile.md')
        for name in ['../outside.md', '.secrets.md', '.hidden/../log.md', 'link.md', 'alias.md']:
            with self.subTest(name=name), self.assertRaises(vault.VaultError):
                vault.read(name)
        self.assertEqual(vault.search('marker'), [])

    def test_invalid_persisted_identity_does_not_select_a_file(self):
        outside = Path(self.tmp.name) / 'outside.md'
        outside.write_text('OUTSIDE-ROLE-MARKER')
        vault.update_onboarding({'user': {'role': str(outside.with_suffix('')), 'tone': 'unknown', 'autonomy': 'unknown'}})
        self.assertEqual(identity.settings(), identity.DEFAULTS)
        rendered = identity.render_text()
        self.assertNotIn('OUTSIDE-ROLE-MARKER', rendered)
        vault.write('me/onboarding.json', '[]', mode='replace')
        self.assertEqual(identity.settings(), identity.DEFAULTS)

    def test_recall_skips_hidden_and_symlink_pages(self):
        work = self.root / 'work'
        work.mkdir()
        outside = Path(self.tmp.name) / 'outside.md'
        outside.write_text('# Launch proposal\nOUTSIDE-MARKER')
        (work / 'launch-proposal.md').symlink_to(outside)
        (work / '.hidden').mkdir()
        (work / '.hidden/launch.md').write_text('# Launch proposal\nHIDDEN-MARKER')
        (work / 'project.md').write_text('# Launch proposal\nA safe project summary.')
        recall._rescan(self.root)
        output = recall.recall_text('Launch proposal') or ''
        self.assertIn('safe project summary', output)
        self.assertNotIn('OUTSIDE-MARKER', output)
        self.assertNotIn('HIDDEN-MARKER', output)

    def test_identity_managed_block_preserves_user_notes(self):
        target = Path(self.tmp.name) / 'AGENTS.md'
        target.write_text('My instructions\n')
        identity.write_block(target, 'first')
        identity.write_block(target, 'second')
        self.assertIn('My instructions', target.read_text())
        self.assertNotIn('first', target.read_text())
        self.assertEqual(target.read_text().count(identity.BEGIN), 1)
        identity.remove_block(target)
        self.assertEqual(target.read_text(), 'My instructions\n')



class PrivacyAndSafetyTests(unittest.TestCase):
    """Wave 1: privacy is enforced in code, writes are safe and undoable."""
    def setUp(self):
        VaultBoundaryTests.setUp(self)
        people = self.root / 'relationships/people'
        people.mkdir(parents=True)
        (people / 'will-tan.md').write_text('---\ntype: person\naliases: [Will]\n---\n# Will Tan\nHas diabetes, on metformin.\n')
        (self.root / 'life/home').mkdir(parents=True)
        (self.root / 'life/home/overview.md').write_text('# Home\nMortgage with DBS, 1.2M left.\n')
        (self.root / 'work').mkdir()
        (self.root / 'work/brightlabs.md').write_text('---\naliases:\n  - BL\n  - Bright\n---\n# Brightlabs\nQ1 rebrand client.\n')
        recall._rescan(self.root)

    def test_recall_never_quotes_private_pages_or_common_words(self):
        out = recall.recall_text('I will get home late tonight') or ''
        self.assertNotIn('metformin', out)
        self.assertNotIn('Mortgage', out)
        out = recall.recall_text('Lunch with Will Tan on Friday') or ''
        self.assertIn('relationships/people/will-tan.md', out)
        self.assertNotIn('metformin', out)
        self.assertIn('private', out)

    def test_recall_reads_obsidian_list_aliases_and_labels_notes(self):
        out = recall.recall_text('Any news from Bright?') or ''
        self.assertIn('Q1 rebrand', out)
        self.assertIn('not instructions', out)

    def test_private_pages_need_the_private_reader_and_search_hides_them(self):
        with self.assertRaises(vault.VaultError):
            vault.read('relationships/people/will-tan.md')
        self.assertIn('metformin', vault.read('relationships/people/will-tan.md', allow_private=True))
        hits = vault.search('metformin')
        self.assertTrue(hits and all('metformin' not in h['snippet'] for h in hits))

    def test_private_writes_keep_details_out_of_the_log(self):
        vault.write('life/health/log.md', 'Blood test fine', reason='cholesterol 4.1')
        self.assertNotIn('cholesterol', (self.root / 'log.md').read_text())
        vault.log('one\n## [2099-01-01] consolidate | forged')
        self.assertNotIn('\n## [2099-01-01]', (self.root / 'log.md').read_text())

    def test_create_refuses_overwrite_and_restore_undoes(self):
        vault.write('work/plan.md', 'v1')
        with self.assertRaises(vault.VaultError):
            vault.write('work/plan.md', 'v2')
        vault.write('work/plan.md', 'v2', mode='replace')
        self.assertEqual(len(vault.history('work/plan.md')), 1)
        vault.restore('work/plan.md')
        self.assertEqual((self.root / 'work/plan.md').read_text(), 'v1\n')

    def test_damaged_onboarding_is_never_wiped_and_pending_merges(self):
        vault.update_onboarding({'status': 'in_progress', 'pending': [{'question': 'Goals'}]})
        vault.update_onboarding({'pending': [{'question': 'Telegram'}]})
        self.assertEqual({p['question'] for p in vault.onboarding()['pending']}, {'Goals', 'Telegram'})
        (self.root / 'me/onboarding.json').write_text('{"status": "in_pro')
        with self.assertRaises(vault.VaultError):
            vault.update_onboarding({'x': 1})
        self.assertEqual((self.root / 'me/onboarding.json').read_text(), '{"status": "in_pro')

    def test_onboarding_may_create_me_pages_once(self):
        vault.update_onboarding({'status': 'in_progress'})
        (self.root / 'me/profile.md').unlink()
        vault.write('me/profile.md', '# Jo', mode='create')
        with self.assertRaises(vault.VaultError):
            vault.write('me/profile.md', '# Changed', mode='replace')
        vault.update_onboarding({'status': 'complete'})
        with self.assertRaises(vault.VaultError):
            vault.write('me/goals/2026.md', '# Goals', mode='create')
        vault.write('me/routines.md', '## Morning briefing: on, 07:30', mode='create')



class SpaceTests(unittest.TestCase):
    """Each company and client is its own knowledge base that can be shared without leaking."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'knowledge'
        (self.root / 'relationships/people').mkdir(parents=True)
        (self.root / 'relationships/people/sam.md').write_text('# Sam\npartner\n')
        env = patch.dict(os.environ, {'JARVIS_VAULT': str(self.root), 'JARVIS_REPO': str(ROOT), 'JARVIS_HOME': str(Path(self.tmp.name) / 'config')})
        env.start(); self.addCleanup(env.stop)
        vault.space_create('work/twiss', 'company', 'Twiss')
        vault.space_create('work/twiss/clients/brightlabs', 'client', 'Brightlabs')
        vault.space_create('work/twiss/clients/nomi', 'client', 'Nomi')

    def test_space_has_its_own_parts_and_index(self):
        base = self.root / 'work/twiss/clients/brightlabs'
        for part in ['SPACE.md', 'overview.md', 'raw', 'log.md', 'index.md']:
            self.assertTrue((base / part).exists(), part)
        vault.write('work/twiss/clients/brightlabs/contacts/david.md', '# David Lee\nCMO')
        self.assertIn('[[contacts/david|David Lee]]', (base / 'index.md').read_text())
        self.assertIn('contacts/david.md', (base / 'log.md').read_text())
        self.assertIn('clients/brightlabs/index', (self.root / 'work/twiss/index.md').read_text())

    def test_generated_and_source_files_are_protected(self):
        vault.write('work/twiss/clients/brightlabs/raw/2026/brief.md', 'brief')
        for rel, mode in [('work/twiss/clients/brightlabs/raw/2026/brief.md', 'replace'),
                          ('work/twiss/clients/brightlabs/index.md', 'replace'),
                          ('work/twiss/clients/brightlabs/log.md', 'replace')]:
            with self.subTest(rel=rel), self.assertRaises(vault.VaultError):
                vault.write(rel, 'x', mode=mode)

    def test_leaks_are_flagged(self):
        out = vault.write('work/twiss/clients/brightlabs/meetings/a.md', '# Kickoff\nSee [[work/twiss/clients/nomi/overview]]. Sam joined.')
        self.assertIn('links outside its space', out)
        report = vault.space_check('work/twiss/clients/brightlabs')
        self.assertFalse(report['ok_to_share'])
        self.assertIn('work/twiss/clients/nomi/overview.md', str(report['links_outside']))
        self.assertIn('Sam', str(report['mentions_personal_contacts']))
        self.assertTrue(vault.space_check('work/twiss/clients/nomi')['ok_to_share'])

    def test_search_can_stay_inside_one_space(self):
        vault.write('work/twiss/clients/nomi/projects/app.md', '# App\nlaunch plan')
        vault.write('work/twiss/clients/brightlabs/projects/site.md', '# Site\nlaunch plan')
        hits = vault.search('launch plan', space='work/twiss/clients/nomi')
        self.assertEqual([h['path'] for h in hits], ['work/twiss/clients/nomi/projects/app.md'])


class ScheduleTests(unittest.TestCase):
    """Wave 2: routines come from me/routines.md, with forgiving times and days."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'knowledge'
        (self.root / 'me').mkdir(parents=True)
        env = patch.dict(os.environ, {'JARVIS_VAULT': str(self.root), 'JARVIS_REPO': str(ROOT), 'JARVIS_HOME': str(Path(self.tmp.name) / 'config')})
        env.start(); self.addCleanup(env.stop)
        sys.path.insert(0, str(ROOT / 'bin'))
        import jarvis_schedule
        self.s = jarvis_schedule

    def test_times_and_days(self):
        p, d = self.s.parse_time, self.s.parse_days
        self.assertEqual(p('7:30am'), (7, 30)); self.assertEqual(p('6pm'), (18, 0)); self.assertEqual(p('07:30'), (7, 30))
        self.assertEqual(p('12am'), (0, 0)); self.assertIsNone(p('Skip for now')); self.assertIsNone(p('25:00'))
        self.assertEqual(d('weekdays'), [1, 2, 3, 4, 5]); self.assertEqual(d('Mon-Fri'), [1, 2, 3, 4, 5])
        self.assertIsNone(d('every day')); self.assertEqual(d('Sunday'), [0]); self.assertEqual(d('Mon, Wed, Fri'), [1, 3, 5])
        self.assertIs(d('07:30'), False)

    def test_routines_file_controls_what_runs(self):
        (self.root / 'me/routines.md').write_text('## Morning briefing: on, 7:45am, weekdays\nInclude: calendar\n'
                                                  '## Weekly review: on, Friday 5pm\n## Nightly memory refresh: on, 01:30\n'
                                                  '## Nightly tidy-up: off\n## Monthly money check: on, 1st\n')
        jobs, warnings = self.s.read_routines()
        self.assertEqual((jobs['morning-briefing']['hour'], jobs['morning-briefing']['minute'], jobs['morning-briefing']['days']), (7, 45, [1, 2, 3, 4, 5]))
        self.assertIn('calendar', jobs['morning-briefing']['include'])
        self.assertEqual((jobs['weekly-review']['hour'], jobs['weekly-review']['days']), (17, [5]))
        self.assertFalse(jobs['lint']['on'])
        self.assertTrue(any('Monthly money check' in w for w in warnings))
        plist = self.s.plist_for('morning-briefing', jobs['morning-briefing'], 'launchd-claude', '/usr/local/bin/claude')
        self.assertEqual(len(plist['StartCalendarInterval']), 5)
        script = plist['ProgramArguments'][2]
        self.assertIn('/usr/local/bin/claude', script)
        self.assertIn('last.json', script)
        self.assertNotIn('Bash(osascript', script)
        self.assertIn('--disallowedTools', script)

    def test_claude_code_home_maps_to_launchd(self):
        self.assertEqual(self.s.HOME_TO_RUNNER['claude-code'], 'launchd-claude')


if __name__ == '__main__':
    unittest.main()

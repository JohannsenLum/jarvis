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
        vault.write('me/onboarding.json', '[]')
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


if __name__ == '__main__':
    unittest.main()

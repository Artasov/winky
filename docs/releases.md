# Releases via GitHub Actions

Automated cross-platform builds and releases triggered by pushing tags.

## 🚀 How to create a release

```bash
# Patch 0.1.0 → 0.1.1
npm version patch
git push origin main --tags

# Minor 0.1.1 → 0.2.0
npm version minor
git push origin main --tags

# Major 0.2.0 → 1.0.0
npm version major
git push origin main --tags

# Or manual tag
git tag v1.0.0
git push origin main --tags

```
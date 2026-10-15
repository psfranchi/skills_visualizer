---
# Leading comment: must survive edits.
name: unknown-fields
description: Skill with extra frontmatter fields that no spec defines. # trailing comment
owner: platform-team # not part of any spec
tags:
  - experimental
  - fixture
custom:
  nested:
    value: 42
license: MIT
metadata:
  version: "1.0"
---

# Unknown fields

Unknown fields are kept as attributes and reported, never dropped.

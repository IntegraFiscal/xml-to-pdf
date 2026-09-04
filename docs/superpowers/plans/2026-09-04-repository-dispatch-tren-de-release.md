# Aviso al tren de release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tras publicar la imagen en ghcr.io, emitir un `repository_dispatch`
de tipo `app-published` hacia `IntegraFiscal/NeuralTax-deployment` con la app,
el tag publicado y el SHA del commit.

**Architecture:** Tres pasos nuevos al final del job `publish` de
`.github/workflows/ci.yml`, después de `Build and push`. No hay código de
aplicación: el cambio es YAML de GitHub Actions más un fragmento de shell que
extrae el tag `sha-` de la salida de `docker/metadata-action`. La implementación
es un espejo de la que ya corre en `IntegraFiscal/NeuralTax`.

**Tech Stack:** GitHub Actions, `actions/create-github-app-token@v3`, `gh` CLI
(preinstalado en los runners de GitHub), `jq`, `sed`.

**Spec:** `docs/superpowers/specs/2026-09-04-repository-dispatch-tren-de-release-design.md`
**Issue:** IntegraFiscal/xml-to-pdf#1

## Global Constraints

- El receptor valida `app` contra la lista `backend|ui|xml-to-pdf`. Aquí el
  valor es exactamente `xml-to-pdf`.
- El receptor valida `tag` contra `^sha-[0-9a-f]{7,40}$`. Un tag que no case
  hace fallar el run de promoción.
- `event_type` es exactamente `app-published`. Cualquier otro valor no dispara
  `promote.yml`.
- Secretos ya existentes en este repo, con estos nombres exactos:
  `RELEASE_TRAIN_APP_ID`, `RELEASE_TRAIN_PRIVATE_KEY`.
- Los pasos nuevos van **después** de `Build and push`. Sin `if:` propio: el
  `if:` del job ya restringe a `push` sobre `refs/heads/main`, y sin `if:` un
  fallo previo aborta el job y no emite aviso.
- Datos que vienen de fuera o son secretos viajan por `env:`, nunca
  interpolados con `${{ }}` dentro del bloque `run:`.
- Nada más del workflow cambia: `quality`, login, `meta` y `Build and push` se
  quedan como están.
- Rama de trabajo: `ci/dispatch-release-train` (ya creada, con el spec
  commiteado).

---

## File Structure

- Modify: `.github/workflows/ci.yml` — se añaden tres pasos tras la línea 68
  (fin de `Build and push`, último paso del job `publish`). Único archivo del
  cambio.

---

### Task 1: Emitir el dispatch al final del job `publish`

**Files:**
- Modify: `.github/workflows/ci.yml:60-68` (añadir después de la línea 68)

**Interfaces:**
- Consumes: `steps.meta.outputs.tags` — salida multilínea de
  `docker/metadata-action@v6` ya presente en el job con `id: meta`. Con la
  configuración actual (`type=sha,prefix=sha-` y `type=raw,value=latest`)
  contiene dos líneas, p. ej.:
  ```
  ghcr.io/IntegraFiscal/xml-to-pdf:sha-1a2b3c4
  ghcr.io/IntegraFiscal/xml-to-pdf:latest
  ```
- Produces: un `repository_dispatch` con
  `{event_type: "app-published", client_payload: {app, tag, commit}}` que consume
  `IntegraFiscal/NeuralTax-deployment/.github/workflows/promote.yml`.

- [ ] **Step 1: Escribir la comprobación que falla — el extractor de tag**

El único trozo con lógica es el `sed` que saca el tag `sha-` de la salida de
`metadata-action`. Se comprueba contra una muestra real antes de meterlo en el
workflow. Guardar en el scratchpad (NO se commitea, es una comprobación de un
solo uso):

```bash
cat > /tmp/check-tag-extract.sh <<'SCRIPT'
set -euo pipefail

extract() {
  printf '%s\n' "$1" | sed -n 's#.*:\(sha-[0-9a-f]\{7,40\}\)$#\1#p' | head -n1
}

# Caso 1: salida real de metadata-action, tag sha- primero.
got="$(extract 'ghcr.io/IntegraFiscal/xml-to-pdf:sha-1a2b3c4
ghcr.io/IntegraFiscal/xml-to-pdf:latest')"
[ "$got" = "sha-1a2b3c4" ] || { echo "caso 1 FAIL: '$got'"; exit 1; }

# Caso 2: orden invertido — no debe devolver 'latest'.
got="$(extract 'ghcr.io/IntegraFiscal/xml-to-pdf:latest
ghcr.io/IntegraFiscal/xml-to-pdf:sha-1a2b3c4')"
[ "$got" = "sha-1a2b3c4" ] || { echo "caso 2 FAIL: '$got'"; exit 1; }

# Caso 3: sin tag sha- — debe salir vacío para que el paso falle.
got="$(extract 'ghcr.io/IntegraFiscal/xml-to-pdf:latest')"
[ -z "$got" ] || { echo "caso 3 FAIL: esperaba vacío, obtuve '$got'"; exit 1; }

# Caso 4: el tag debe casar la regex que valida el receptor.
got="$(extract 'ghcr.io/IntegraFiscal/xml-to-pdf:sha-1a2b3c4')"
printf '%s' "$got" | grep -qE '^sha-[0-9a-f]{7,40}$' \
  || { echo "caso 4 FAIL: el receptor rechazaría '$got'"; exit 1; }

echo "OK: 4/4"
SCRIPT
```

- [ ] **Step 2: Ejecutar la comprobación**

Run: `bash /tmp/check-tag-extract.sh`
Expected: `OK: 4/4`

Si algún caso falla, el `sed` está mal y hay que arreglarlo **aquí**, antes de
tocar el workflow — depurar esto dentro de un run de Actions cuesta minutos por
iteración.

- [ ] **Step 3: Añadir los tres pasos al workflow**

Añadir al final de `.github/workflows/ci.yml`, después de la línea
`          cache-to: type=gha,mode=max`, con la misma indentación que los pasos
existentes del job `publish` (6 espacios para el `- name:`):

```yaml

      # ── Aviso al tren de release ─────────────────────────────────────────
      # Tras publicar, avisamos a NeuralTax-deployment, que escribe el bump del
      # tag y el PR de promoción (IntegraFiscal/NeuralTax-deployment#8). Estos
      # pasos van DESPUÉS del push: si el push falla, el job aborta y no se
      # emite ningún aviso — un aviso sin imagen detrás produciría un PR
      # apuntando a un tag inexistente.
      # No llevan `if:` propio: el del job ya restringe a push sobre main.
      - name: Resolver el tag publicado
        id: published
        env:
          TAGS: ${{ steps.meta.outputs.tags }}
        run: |
          set -euo pipefail
          tag="$(printf '%s\n' "$TAGS" | sed -n 's#.*:\(sha-[0-9a-f]\{7,40\}\)$#\1#p' | head -n1)"
          if [ -z "$tag" ]; then
            printf 'ningún tag sha- entre los publicados:\n%s\n' "$TAGS" >&2
            exit 1
          fi
          printf 'tag=%s\n' "$tag" >> "$GITHUB_OUTPUT"

      - name: Token efímero de la App
        id: token
        uses: actions/create-github-app-token@v3
        with:
          app-id: ${{ secrets.RELEASE_TRAIN_APP_ID }}
          private-key: ${{ secrets.RELEASE_TRAIN_PRIVATE_KEY }}
          owner: IntegraFiscal
          # Solo el repo receptor. Este repo únicamente dispara; no necesita
          # leer los otros repos de app.
          repositories: NeuralTax-deployment

      - name: Avisar al tren de release
        env:
          GH_TOKEN: ${{ steps.token.outputs.token }}
          TAG: ${{ steps.published.outputs.tag }}
          COMMIT: ${{ github.sha }}
        run: |
          set -euo pipefail
          jq -n --arg tag "$TAG" --arg commit "$COMMIT" \
            '{event_type:"app-published",
              client_payload:{app:"xml-to-pdf", tag:$tag, commit:$commit}}' \
          | gh api repos/IntegraFiscal/NeuralTax-deployment/dispatches --input -
```

- [ ] **Step 4: Verificar que el YAML sigue siendo válido**

`actionlint` no está instalado en esta máquina. Con Docker disponible:

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color`
Expected: sin salida y código de salida 0.

Sin Docker, comprobar al menos que parsea y que los pasos quedaron dentro del
job correcto:

Run:
```bash
python3 -c "
import yaml
w = yaml.safe_load(open('.github/workflows/ci.yml'))
names = [s.get('name') for s in w['jobs']['publish']['steps']]
print(names)
assert names[-3:] == ['Resolver el tag publicado', 'Token efímero de la App', 'Avisar al tren de release'], names
assert list(w['jobs']) == ['quality', 'publish'], list(w['jobs'])
print('OK')
"
```
Expected: la lista de pasos y luego `OK`.

- [ ] **Step 5: Revisar el diff a ojo**

Run: `git diff .github/workflows/ci.yml`

Confirmar, contra Global Constraints:
- Los tres pasos van después de `Build and push`, no antes.
- No se modificó ninguna línea previa a la 68.
- `app` es `xml-to-pdf`, `event_type` es `app-published`.
- Ningún `${{ secrets.* }}` ni `${{ github.* }}` aparece dentro de un bloque
  `run:`; todos llegan por `env:`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: avisar al tren de release tras publicar la imagen

Emite un repository_dispatch app-published hacia NeuralTax-deployment con
la app, el tag publicado y el SHA del commit, para que ese repo escriba el
bump y el PR de promoción.

Los pasos van después del push: si la publicación falla, el job aborta y no
se emite aviso. El if: del job ya excluye PRs y ramas distintas de main.

Closes #1

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Abrir el PR y verificar en CI real

Los criterios de aceptación "un PR no dispara nada" y "un merge publica y luego
avisa" solo se pueden observar en GitHub. Esta tarea es la verificación.

**Files:**
- Ninguno. Solo interacción con GitHub.

**Interfaces:**
- Consumes: la rama `ci/dispatch-release-train` con el commit de la Task 1.
- Produces: un PR contra `main` listo para revisión humana.

- [ ] **Step 1: Push de la rama**

```bash
git push -u origin ci/dispatch-release-train
```

- [ ] **Step 2: Abrir el PR**

```bash
gh pr create --base main --title "ci: avisar al tren de release tras publicar la imagen" --body "$(cat <<'EOF'
Añade al final del job `publish` el aviso a `NeuralTax-deployment`: un
`repository_dispatch` de tipo `app-published` con `{app, tag, commit}`.

Espejo de la implementación ya existente en `IntegraFiscal/NeuralTax`. El
receptor es `NeuralTax-deployment/.github/workflows/promote.yml`.

- Los pasos van después del push: si la publicación falla, el job aborta y no
  se emite ningún aviso.
- El `if:` del job ya excluye PRs y ramas distintas de `main`.
- Tag, commit y token viajan por `env:`, nunca interpolados en el `run:`.

Spec: `docs/superpowers/specs/2026-09-04-repository-dispatch-tren-de-release-design.md`

Closes #1

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JWp8dSHGxntMdtUir76f27
EOF
)"
```

- [ ] **Step 3: Verificar que el PR NO dispara el job `publish`**

Esperar a que terminen los checks del PR y listar los jobs:

```bash
gh pr checks --watch
gh run list --branch ci/dispatch-release-train --limit 1
gh run view --json jobs --jq '.jobs[] | {name, conclusion}' \
  "$(gh run list --branch ci/dispatch-release-train --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: aparece `Lint & Test` con `success`. **`Build & Push Docker Image` NO
aparece o aparece como `skipped`.** Si aparece con `success`, el `if:` del job
se rompió — parar y revisar.

- [ ] **Step 4: Verificación post-merge (tras aprobación humana)**

Este paso requiere que un humano mergee el PR. Después:

```bash
gh run list --branch main --limit 1
gh run watch
```

Expected en el repo receptor, un run nuevo de `promote`:

```bash
gh run list --repo IntegraFiscal/NeuralTax-deployment --workflow promote.yml --limit 1
```

Comprobar en los logs del paso `Resolver el disparador` que `app` es
`xml-to-pdf` y que el tag coincide con el publicado en ghcr.io:

```bash
gh api "/orgs/IntegraFiscal/packages/container/xml-to-pdf/versions" \
  --jq '.[0].metadata.container.tags'
```

Expected: la lista incluye el mismo `sha-XXXXXXX` que viajó en el aviso.

- [ ] **Step 5: Confirmar que el token no aparece en los logs**

En los logs del run de `publish`, el paso `Avisar al tren de release` no debe
mostrar el token: Actions enmascara las salidas de
`create-github-app-token` como `***`. Confirmar visualmente en la UI del run o:

```bash
gh run view --log --job "$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')" 2>/dev/null | grep -c 'ghs_' || echo "0 ocurrencias — OK"
```

Expected: `0 ocurrencias — OK`.

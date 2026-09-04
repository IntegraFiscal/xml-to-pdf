# Aviso al tren de release tras publicar la imagen

Issue: IntegraFiscal/xml-to-pdf#1 · Epic: IntegraFiscal/coordinator#9
Receptor: IntegraFiscal/NeuralTax-deployment#8

## Problema

El CI de este repo termina al publicar la imagen en ghcr.io. Nadie la corre: el
bump del tag y el PR de promoción los escribe `NeuralTax-deployment`, que
centraliza la escritura para evitar carreras entre los tres repos de app. Falta
el aviso que arranca ese proceso.

## Contrato (ya fijado por el receptor)

`NeuralTax-deployment/.github/workflows/promote.yml` escucha
`repository_dispatch` con `types: [app-published]` y valida el payload:

- `app` — uno de `backend`, `ui`, `xml-to-pdf`. Aquí siempre `xml-to-pdf`.
- `tag` — debe casar `^sha-[0-9a-f]{7,40}$`.
- `commit` — SHA completo, para construir el changelog del PR.

Credenciales: GitHub App del tren de release. Los secretos
`RELEASE_TRAIN_APP_ID` y `RELEASE_TRAIN_PRIVATE_KEY` ya existen en este repo.
`GITHUB_TOKEN` no cruza repos.

La implementación es un espejo de la de `IntegraFiscal/NeuralTax`, que ya emite
este mismo aviso. Divergir de ella no aporta nada y complica el mantenimiento
del receptor.

## Cambio

Tres pasos al final del job `publish` de `.github/workflows/ci.yml`, después de
`Build and push`. Nada más del CI cambia: `quality`, login, metadata y build se
quedan como están.

1. **Resolver el tag publicado** — extrae el `sha-XXXXXXX` de
   `steps.meta.outputs.tags` con `sed`, y falla si no encuentra ninguno. Lee el
   tag realmente publicado en vez de reconstruirlo desde `github.sha`: así el
   aviso no puede desviarse de lo que hay en el registry.
2. **Token efímero de la App** — `actions/create-github-app-token@v3` con
   `owner: IntegraFiscal` y `repositories: NeuralTax-deployment`. Alcance mínimo:
   este repo solo necesita disparar, no leer los otros repos de app.
3. **Avisar al tren de release** — `jq -n` construye el JSON y lo envía a
   `gh api repos/IntegraFiscal/NeuralTax-deployment/dispatches --input -`.

### Seguridad y orden

- Los tres pasos van **después** del push. Si el push falla el job aborta y no
  se emite ningún aviso: un aviso sin imagen detrás produciría un PR apuntando
  a un tag inexistente.
- El `if:` del job (`github.event_name == 'push' && github.ref ==
  'refs/heads/main'`) ya excluye PRs. No hacen falta guardas de ref por paso, a
  diferencia de `NeuralTax`, que además publica en tags `v*`.
- Sin `workflow_dispatch` manual: fuera del alcance del issue, y añadiría una
  segunda vía que habría que volver a recortar por ref.
- Tag, commit y token viajan por `env:`, nunca interpolados dentro del script.
  El token es una salida de paso, que Actions enmascara en los logs.

## Criterios de aceptación

- Un merge a `main` publica la imagen y luego dispara el aviso, en ese orden.
- Si la publicación falla, no se emite ningún aviso.
- Un PR no dispara nada.
- El tag del aviso es exactamente el publicado en ghcr.io.
- El secreto del token no aparece en los logs.

## Verificación

No hay tests unitarios para YAML de Actions. La verificación es:

1. `actionlint` sobre el workflow modificado.
2. Un PR contra `main`: el job `publish` no corre, luego nada se dispara.
3. Tras el merge: el run de `publish` termina en verde y el receptor
   `promote.yml` de `NeuralTax-deployment` arranca con
   `client_payload.app == "xml-to-pdf"` y el tag publicado.

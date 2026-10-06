# Solarwake — Arquivos de contexto

Mapa do que existe no repositório `ANDIMSS/jogop` (branch `arena/9812d7f4-jogop`), com o papel de cada
arquivo, tamanho e linhas. A contagem parte de `git ls-files` — **68 arquivos versionados**, todos
dentro de `solarwake (2)/`, mais 8 novos de código/teste e 2 na raiz do repo (ver §10 e §11).
Todas as linhas abaixo foram medidas no checkout atual (`wc -l`), não são estimativas.

| Item | Valor |
| --- | --- |
| Arquivos versionados | 68 no git + 10 novos de código/teste + 2 na raiz (§10, §11, §12) |
| Linhas em `src/` + `scripts/` + `tests/` | 11.100 |
| Tamanho do projeto (sem `node_modules`/`dist`/`shots`) | 8,1 MB (2,2 MB só de `public/`, quase tudo fonte CJK; 5,3 MB em `assets/`) |
| `node_modules` / `dist` (gerados, ignorados) | 170 MB / 13 MB |
| Testes | 8 arquivos, 64 testes, todos verdes (`pnpm test`, ~3 s) |
| Bundle (gzip) | js 1,76 MB / fontes 1,85 MB / transfer 4,26 MB — dentro do orçamento |

---

## 1. Raiz do projeto — `solarwake (2)/`

| Arquivo | Tam. | Linhas | Papel |
| --- | --- | --- | --- |
| `README.md` | 6,3 KB | 95 | Documento-mestre: pitch, controles, roteiro das **duas missões**, layout de módulos e **regras para mudanças** (simulação em `step()`, regras puras, i18n obrigatório, UI navegável, orçamento de bundle). Leia primeiro. |
| `.gitignore` (raiz `jogop/`) | 190 B | 12 | **Novo nesta sessão**: ignora `node_modules/`, `dist/`, `shots/`, `.manus-webdev/`, `.DS_Store`, `*.log`. |
| `ARQUIVOS-DE-CONTEXTO.md` (raiz `jogop/`) | 11 KB | 169 | **Este documento** (mapa de contexto do repositório). |
| `index.html` | 727 B | 17 | Casca da página: `<canvas id="game">`, `<div id="ui">`, preload das fontes, entrada `/src/main.ts`. |
| `package.json` | 715 B | 27 | Scripts `dev`/`build`/`preview`/`typecheck`/`test`/`smoke`; deps three ^0.186, Rapier ^0.21; pnpm 10.18. |
| `pnpm-lock.yaml` | 22,7 KB | 713 | Lockfile — instalação reproduzível. |
| `tsconfig.json` | 444 B | 17 | ES2022, `strict`, `noUnusedLocals/Parameters`, `moduleResolution: Bundler`. |
| `vite.config.ts` | 946 B | 19 | Base relativa, plugin de tuning Manus, servidor dev e **allowedHosts**. Alterado nesta sessão: `host` `0.0.0.0` + `.e2b.app` liberado (ver §9). |
| `template.json` | 454 B | 11 | Metadados do template de origem (`game-3d`, three.js, status draft). |
| `game-sharing.json` | 753 B | 15 | Título, descrição, legendas para X/Facebook/Reddit/Discord e caminhos das imagens OG/favicon. |

## 2. `assets/` e `public/` — mídia e fontes

| Arquivo | Tam. | Papel |
| --- | --- | --- |
| `assets/share/solarwake-og.png` | 5,2 MB | Imagem Open Graph para compartilhamento. |
| `assets/share/solarwake-favicon.png` | 335 KB | Favicon de origem. |
| `public/assets/share/solarwake-favicon.png` | 335 KB | Cópia servida em runtime. |
| `public/fonts/Sora-VF.subset.woff2` | 41,7 KB | Fonte de display (subset). |
| `public/fonts/Figtree-VF.subset.woff2` | 23,7 KB | Fonte de texto (subset). |
| `public/fonts/NotoSansSC-VF.subset.woff2` | 1,87 MB | Subset chinês — dominante no orçamento de transferência. |
| `public/fonts/*-OFL.txt` (3) | ~13 KB | Licenças SIL OFL 1.1. |

## 3. `src/engine/` — infraestrutura reutilizável (sem conhecimento de gameplay)

| Arquivo | Linhas | Papel |
| --- | --- | --- |
| `loop.ts` | 71 | Simulação fixa a 60 Hz, render interpolado, `timeScale` global (hit-stop / slow-mo). |
| `timeline.ts` | 203 | Sistema de eventos de ritmo: `wait`, `at`, `call`, `every`, loops — usado pelo nível e pelo boss. |
| `impact.ts` | 187 | Ferramenta de "feel": hit-stop, slow-mo, trauma shake, kick direcional, flash, pulso de distorção. |
| `input.ts` | 217 | Teclado/mouse, gamepad de dois analógicos e toque unificados em um único estado de ações. |
| `physics.ts` | 167 | Mundo Rapier, alvos cinemáticos, consultas raio/segmento para tiros e mira. |
| `renderer.ts` | 187 | WebGL, tiers de qualidade, bloom + pós (aberração, zoom, tint, vignette). |
| `pool.ts` | 131 | `ObjectPool` e `InstancedBatch` sem alocação — um draw call por tipo. |
| `assets.ts` | 56 | Carregamento/progresso de assets. |
| `audio.ts` | 217 | Buses de mixagem e receitas de SFX sintetizados. |
| `music.ts` | 137 | Música procedural em sequenciador de passos. |
| `save.ts` | 122 | Save local versionado + leaderboard (agora com `stage` e fase por recorde). |
| `i18n.ts` | 47 | Resolução de locale (escolha salva > idioma do navegador) e lookup de chaves. |

## 4. `src/game/` — o jogo

| Arquivo | Linhas | Papel |
| --- | --- | --- |
| `game.ts` | 924 | Orquestrador: estado de partida, colisões, score, transições de tela, seleção de fase, atmosfera, vitória sem chefe e os modos de câmera (`play` × `glass`, a câmera fixa da fase 3). |
| `boss.ts` | 861 | BOREWARDEN: modelo, partes, timelines das 3 fases e verbos de ataque. |
| `director.ts` | 41 | **Vocabulário de verbos** que uma fase pode usar (`spawn`, `banner`, `setTheme`, `setCamera`, `atmosphere`, `clear`…). |
| `formations.ts` | 49 | Fragmentos de formação reaproveitados por todas as fases (snake, vee, spiral, overtake, chisel, lantern). |
| `stages.ts` | 90 | **Registro de fases**: ids, tema, rótulo de checkpoint, flag `endless`, chaves i18n e o construtor de cada timeline. |
| `level.ts` | 155 | Fase 1 "The Shattered Ring" como **um script de timeline** (launch → wave 1 → asteroides → wave 2 → BOREWARDEN). |
| `stage-orbit.ts` | 212 | Fase 2 "Earth Orbit": inserção → cascata de Kessler → rasante atmosférica → bloqueio orbital → fuga (sem chefe, termina com `clear()`). |
| `config.ts` | 91 | **Todos os números de tuning** em um lugar (inclui `stages.<id>.clearBonus`; a fase 3 é infinita, bônus 0). |
| `rules.ts` | 179 | Regras puras de casco/escudo/combo/score/grade — cobertas por testes (`win` aceita clear bonus por fase). |
| `enemies.ts` | 428 | Inimigos em pool + instancing e formações. |
| `bullets.ts` | 265 | Padrões de projéteis. |
| `env.ts` | 617 | Céu, planeta, asteroides, estações orbitais, campo de velocidade e **temas** (`ring` × `orbit` × `prism`) com a Terra procedural (oceanos, nuvens, luzes noturnas, limbo azul) e, no tema `prism`, cáusticas quase invisíveis no vazio + a laje de obsidiana (`FLOOR_VERT/FRAG`). |
| `fx.ts` | 249 | Partículas e efeitos. |
| `models.ts` | 263 | Modelos low-poly procedurais (inclui `buildStation`, a estação orbital). |
| `ship.ts` | 260 | Nave do jogador, movimento, animações. |
| `rail.ts` | 72 | Spline do trilho + frame de câmera (jogo "on rails"). |
| `textures.ts` | 73 | Texturas procedurais. |
| `audio-content.ts` | 229 | Conteúdo sonoro do jogo (receitas SFX + trilhas; seções `orbit`, `debris`, `skip`, `loop`, `loopTide`). |
| `tuning.ts` | 68 | Store de parâmetros exposto ao painel de tuning do preview Manus. |
| `arena.ts` | 30 | Limites/arena do combate. |
| `glass.ts` | 196 | **Fase 3**: `GlassRibbon`, a fita de vidro translúcida (geometria de faixa + shaders de onda/twist, fresnel por canal, cáusticas viajantes, brilho de borda) que vive no *rig* da nave para a câmera fixa sempre enquadrá-la. |
| `stage-loop.ts` | 109 | **Fase 3 "Continuous Loop"**: timeline infinita (`build({ loop: true })`) sem chefe e sem `clear`, com `drift`, `sentinel`, `threads` e a dupla de `chisel`. |

## 5. UI, i18n e testes

| Arquivo | Linhas | Papel |
| --- | --- | --- |
| `src/main.ts` | 188 | Boot: canvas, save, i18n, input, áudio, UI, toque, loop, seleção de missão, tutorial só na fase 1. |
| `src/ui/ui.ts` | 727 | UI HTML/CSS: título, **missões**, HUD, pause, settings, leaderboard (com etiqueta de fase), results. |
| `src/ui/touch.ts` | 86 | Controles de toque (paisagem). |
| `src/styles/main.css` | 466 | Todo o estilo da UI (inclui os cards de missão). |
| `src/i18n/en.json` | 149 linhas / 147 chaves | Textos em inglês — **toda string visível precisa existir aqui e no zh-CN**. |
| `src/i18n/zh-CN.json` | 149 linhas / 147 chaves | Textos em chinês (mesmas chaves, verificadas por teste). |
| `tests/rules.test.ts` | 104 | Regras de dano/score/grade. |
| `tests/engine.test.ts` | 148 | Loop, timeline e ferramentas de impacto. |
| `tests/save.test.ts` | 43 | Persistência versionada. |
| `tests/i18n.test.ts` | 27 | Paridade de chaves entre idiomas. |
| `tests/tuning.test.ts` | 33 | Store de tuning. |
| `tests/preview.test.mjs` | 36 | Ponte de preview/tuning (9 testes). |
| `tests/stages.test.ts` | 181 | Fases headless: registro, script completo, checkpoints, chaves i18n, trilhas válidas e o caso infinito da fase 3 (nunca termina, repete o ciclo, câmera `glass`). |

## 6. `scripts/` — build, smoke e integração com a plataforma

| Arquivo | Linhas | Papel |
| --- | --- | --- |
| `smoke.mjs` | 205 | Playthrough headless (Playwright) das **três** fases: ring até Results, órbita (tema + checkpoint `finale`) e o Loop infinito (câmera `glass`, tema `prism`, sem chefe/checkpoint). Screenshots em `shots/`; falha em qualquer erro de console. Aceita `CHROMIUM_PATH`, `CHROMIUM_ARGS`, `CHROMIUM_LD_LIBRARY_PATH`, `SMOKE_TIMEOUT` e `SHOTS_DIR`. |
| `headless-browser.mjs` | 84 | **Novo**: monta um Chromium headless a partir dos pacotes npm (`@sparticuz/chromium` 110 + NSS atual + SwiftShader GLES do `chrome-aws-lambda`) e imprime o ambiente para o `pnpm smoke`. Escreve em `.chromium/` (ignorado pelo git). |
| `check-size.mjs` | 29 | Orçamento de bundle gzip: JS 2,0 MB / fontes 2,2 MB / total 4,4 MB. |
| `manus-game-sharing/build.mjs` | 27 | `pnpm build`: chama `tsc --noEmit && vite build`, aplica o budget e depois monta o site de compartilhamento (`publicationOrigin`, título, OG). |
| `manus-game-sharing/metadata.mjs` | 367 | Validação e montagem dos metadados de compartilhamento. |
| `manus-tuning/vite.mjs` | 35 | Plugin de dev (só `serve`) que injeta a ponte de tuning e força full-reload em HMR. |
| `manus-tuning/adapter.js` | 31 | Registra o store de tuning no bridge, com digest SHA-256 do schema. |
| `manus-tuning/identity.mjs` | 19 | Lê `.manus-webdev/preview-identity.json` (ID de preview). |
| `manus-tuning/adapter.d.ts`, `vite.d.mts` | 8 | Tipos. |
| `__manus__/game-tuning.js` | 34 | Bridge injetado no HTML (nunca no build publicado). |
| `__manus__/preview-parent.js` | 34 | Descobre o origin do parent para o handshake do preview. |

## 7. Não versionado / gerado

Todos ignorados pelo `.gitignore` criado nesta sessão (raiz `jogop/.gitignore`):

| Caminho | Estado | Observação |
| --- | --- | --- |
| `solarwake (2)/node_modules/` | existe (170 MB) | Instalado com pnpm 10.18.0 via corepack. |
| `solarwake (2)/dist/` | existe (13 MB) | Saída de `pnpm build` (`index.html`, `assets/`, `fonts/`, `share/` + OG image). Pode apagar à vontade. |
| `solarwake (2)/shots/` | existe (3 MB) | Capturas reais do jogo (`17-stages-loop` … `24-loop-wide` + `galeria-fase3.png`). `pnpm smoke` também escreve aqui (precisa de Chromium). |
| `.manus-webdev/` | não existe | Estado do preview gerenciado (ver `scripts/manus-tuning/identity.mjs`). |
| `.chromium/` | não existe | Navegador provisionado por `scripts/headless-browser.mjs` (~60 MB); criado só quando o download do Playwright falha. |

## 8. Ordem de leitura sugerida para pegar contexto rápido

1. `README.md` (§ "Rules for changes") — as convenções valem mais que o código.
2. `src/game/config.ts` + `src/game/tuning.ts` — todos os números.
3. `src/game/rules.ts` — o que é testado e puro.
4. `src/game/director.ts` + `src/game/stages.ts` + `src/game/formations.ts` — como uma fase é montada.
5. `src/game/level.ts` / `src/game/stage-orbit.ts` / `src/game/stage-loop.ts` + `src/engine/timeline.ts` — o ritmo de cada missão.
6. `src/game/game.ts` → `src/game/boss.ts` — colisões/estado e o chefe.
7. `src/game/env.ts` — céu, planeta e temas (inclui o shader da Terra e o vazio obsidiana).
8. `src/engine/impact.ts` + `loop.ts` — o "feel".
9. `src/ui/ui.ts` + `src/i18n/en.json` — qualquer texto novo passa por aqui.

## 9. Estado desta sessão

- `pnpm install` executado (pnpm 10.18.0 via corepack).
- `pnpm dev` rodando como preview ao vivo (Vite, porta 3000, `0.0.0.0`).
- `vite.config.ts` alterado: `host` padrão `0.0.0.0` e `.e2b.app` adicionado a `allowedHosts`
  (sem isso o preview externo é bloqueado/403).
- `pnpm test`: 7 arquivos, 48 testes, todos passando.
- `pnpm build`: ok — typecheck + bundle dentro do orçamento (js 1,76/2,0 MB; transfer 4,26/4,4 MB) + OG image.
- `pnpm smoke`: **verde nas três fases** — o download do Chromium do Playwright é bloqueado neste
  sandbox, então o navegador é montado por `scripts/headless-browser.mjs` (Chromium 110 de
  `@sparticuz/chromium@110.0.1`, libs NSS da versão atual, SwiftShader GLES do
  `chrome-aws-lambda@10.1.0`, flag `--use-gl=egl`) e o smoke roda com `CHROMIUM_PATH`/
  `CHROMIUM_ARGS`/`CHROMIUM_LD_LIBRARY_PATH` + `SMOKE_TIMEOUT` maior. O roteiro agora vai do título
  em inglês, gameplay, pause, settings, Results (chefe pelas regras reais de dano), missões, órbita
  (tema + checkpoint `finale`) até o **Loop** (câmera fixa, tema `prism`, sem chefe, sem checkpoint,
  nunca termina), depois título em chinês e HUD de celular — 10 capturas, zero erros de console.
- Capturas em `shots/`: as 10 do `pnpm smoke` (`galeria-smoke.png`) e as 8 da fase 3
  (`galeria-fase3.png`, ~67 s de simulação, sem erros de console).
- Nada foi commitado ainda: 18 arquivos modificados + 9 novos (`director.ts`, `formations.ts`,
  `stages.ts`, `stage-orbit.ts`, `stage-loop.ts`, `glass.ts`, `stages.test.ts`,
  `headless-browser.mjs`, `.gitignore`) + este documento.

## 10. Fase nova — Earth Orbit (o que foi criado/alterado)

Novos: `src/game/director.ts`, `src/game/formations.ts`, `src/game/stages.ts`,
`src/game/stage-orbit.ts`, `tests/stages.test.ts` e `.gitignore` na raiz do repo
(ignora `node_modules/`, `dist/`, `shots/`, `.manus-webdev/`).

Alterados: `level.ts` (virou fase 1 do registro, formações extraídas), `env.ts` (temas + planeta
Terra + estações orbitais), `models.ts` (`buildStation`), `audio-content.ts` (trilhas `orbit`,
`debris`, `skip`), `config.ts` (`stages.<id>.clearBonus`), `rules.ts` (`win` aceita clear bonus),
`game.ts` (fase atual, `setTheme`, `atmosphere`, `cue`, `clear`, checkpoint rotulado),
`save.ts` (`stage` e `stage` por recorde), `ui.ts` (tela de missões, etiqueta de fase no ranking,
linha de fase no title/results), `main.ts` (tutorial só na fase 1), `styles/main.css` (cards de
missão), `i18n/*.json` (108 → **136 chaves** em cada idioma, paridade garantida por teste),
`smoke.mjs`, `README.md`.

Verificação da fase: `pnpm typecheck` limpo · `pnpm test` 46/46 · `pnpm build` ok (js 1,76/2,0 MB) ·
`pnpm smoke` bloqueado por falta de navegador (§9). A cobertura nova roda as duas fases headless em
`tests/stages.test.ts` (script completo, checkpoints, chaves i18n, trilhas e a vitória sem chefe).

## 11. Fase nova — Continuous Loop (o que foi criado/alterado)

Novos: `src/game/glass.ts` (a fita de vidro) e `src/game/stage-loop.ts` (a timeline infinita).

Alterados: `director.ts` (`StageTheme` ganhou `prism`, novo verbo `setCamera('play' | 'glass')`),
`stages.ts` (id `loop`, terceira entrada no registro, campo `endless`), `env.ts` (tema `prism`:
vazio obsidiana, sem planeta, sem cinturão, estrelas raras, `sunGlow` 0,10, cáusticas discretas no
domo e a laje `FLOOR_VERT/FRAG` a −46), `game.ts` (`GlassRibbon` no rig, `setCamera`, modo de câmera
`glass` — tripé fixo com respiração lentíssima — e a aberração cromática de borda ligada ao nível da
fita), `renderer.ts` (`post.aberrationEdge`), `config.ts` (`stages.loop.clearBonus = 0`),
`audio-content.ts` (seções `loop` e `loopTide`), `i18n/*.json` (136 → **147 chaves**),
`tests/stages.test.ts` (o caso infinito).

Como a fase funciona: `buildLoopStage()` monta uma timeline com `build({ loop: true })` — intro
(uma única vez, com trava em closure) e depois o rótulo `cycle`, que se repete para sempre. Não há
`startBoss`, nem `clear`, nem `checkpointHere`: o placar só termina quando a nave cai. O céu é o
tema `prism` (vazio obsidiana, alto espaço negativo para o HUD) e a câmera é fixa dentro do *rig*,
de modo que a fita ondula devagar em gravidade zero enquanto o mundo passa — a aberração cromática
de borda acompanha a presença da fita.

Verificação: `pnpm typecheck` limpo · `pnpm test` 48/48 · `pnpm build` ok (js 1,76/2,0 MB) ·
`pnpm smoke` **verde** cobrindo as três fases (o trecho novo checa tema `prism`, câmera `glass`,
ausência de chefe e de checkpoint, presença da fita e da laje, e que a fase não termina) ·
captura real headless da fase 3 (67 s de simulação, sem erros de console), 8 PNGs + galeria em
`shots/`.

---

## 12. Fase nova — Arsenal e Hangar (loja de armas e naves)

Pedido do usuário: *"crie 5 tipos de armamento da nave em progresso, efeitos e danos diferentes,
crie uma loja de compras para fazer upgrade das armas, crie mais 3 naves diferentes pra venda com
pontos do jogo"*. Decisão de escopo: **progressão permanente de garagem**, paga com os pontos do
run (não XP dentro da partida), e tudo orientado a dados para que acrescentar arma/nave seja só
uma entrada nova.

### Arquivos novos

- `src/game/arsenal.ts` (443 linhas) — módulo puro (sem three/DOM) com todo o contrato da loja:
  `WEAPON_IDS`/`SHIP_IDS`/`MAX_LEVEL`, tipos `WeaponStats`/`WeaponDef`/`ShipSpec`, `Loadout`,
  `weaponDef`/`weaponStats`/`shipSpec`, e as funções puras `loadoutOf`/`weaponLevel`/`ownsWeapon`/
  `ownsShip`/`nextWeaponCost`/`buyWeapon`/`buyShip`/`equipWeapon`/`equipShip`/`earn`/`rewardsFor`/
  `shipRules`.
- `src/game/showroom.ts` (97 linhas) — pedestal 3D do hangar (`class Showroom`), com renderer,
  cena, câmera fov 38 e três luzes próprios; reusa `buildShip(id)` com materiais de cor de vértice
  e re-tinge as trilhas. Expõe `show/start/stop/resize` e a flag `failed` caso um segundo contexto
  WebGL não suba. É carregado por `import()` dinâmico em `main.ts`, então `ui.ts` continua sem three.
- `tests/arsenal.test.ts` (256 linhas) — catálogo, curvas de nível, distinção entre as 5 armas,
  cobertura das chaves de i18n, caminhos de compra (subir a escada até o nível 5 e parar), trocas
  entre os cascos (`shipRules`) e o round-trip do save.

### Os 5 armamentos (níveis 1–5, com preço de desbloqueio e quatro upgrades cada)

| id | nome (EN) | desbloqueio | upgrades | efeito que muda por nível |
| --- | --- | --- | --- | --- |
| `pulse` | Pulse Driver | grátis | 1.200 / 2.600 / 5.200 / 9.000 | cadência e leque; 2º cano no nível 5 |
| `scatter` | Scatter Cloud | 3.500 | 2.000 / 4.000 / 7.500 / 12.000 | 6→10 pelotas num cone de 0,3 rad |
| `lance` | Lance Beam | 6.000 | 2.800 / 5.200 / 9.000 / 15.000 | perfuração 1→4 cascos |
| `swarm` | Swarm Pods | 8.000 | 3.200 / 6.000 / 10.000 / 16.000 | 3→7 mísseis teleguiados (2,6 rad/s) |
| `rail` | Rail Slug | 14.000 | 4.500 / 8.000 / 13.000 / 20.000 | dano 9 (+30%/nível), raio de explosão 3,7→5,7, perfuração no nível 4 |

Cada arma tem som próprio (`shoot`/`shootScatter`/`shootLance`/`shootSwarm`/`shootRail`, já
registrados em `audio-content.ts`) e um `tagKey` mostrado no HUD e no título.

### As 4 naves

| id | nome (EN) | preço | hull / shield / velocidade | perfil |
| --- | --- | --- | --- | --- |
| `heliospur` | Heliospur | grátis | 100 / 60 / 16,0 | interceptador equilibrado, o inicial |
| `vesper` | Vesper | 12.000 | 72 / 88 / 21,5 | skirmisher rápido e frágil |
| `bastion` | Bastion | 18.000 | 168 / 74 / 12,5 | linha pesada, o dobro de armadura e o dobro de curva |
| `kite` | Kite | 26.000 | 92 / 118 / 18,5 | asa delta com anel de raspão largo (1,95) |

Hull/shield entram nas regras do run por `shipRules(id, base)`; velocidade, aceleração,
followRate, cooldown de rolamento, raios de acerto/raspão, offset das armas e escala do modelo
saem direto do `ShipSpec` lido pela `Ship` — daí os quatro voarem de verdade diferente.

### Economia

Créditos por run = `round(pontuário × 0,2)` (`rewardsFor`), somados à carteira persistida. Comprar
arma **já equipa** e comprar casco **já equipa** (clicar de novo num casco que já é seu também
equipa). `buyWeapon` devolve `bought|upgraded|equipped|poor|max|unknown` e `buyShip`
`bought|poor|max`; o `ui.ts` toca `buy` ou `denied` conforme a carteira mudou.

### UI

`src/ui/ui.ts` (896 linhas) ganhou a tela `hangar`: modal `screen-hangar` com carteira, abas
armas/cascos, cartões gerados a partir do catálogo (nível em pips, barras de dano/cadência/tiros e
de hull/shield/velocidade/raspão, preço ou ação equipar) e o pedestal 3D. Navegação por teclado
(`data-nav` + Enter/Esc), gamepad (mesmo caminho `moveFocus` dos outros menus) e toque. Botões
"Hangar" no título e nos resultados; no HUD, um chip com a arma equipada e o nível; nos resultados,
a linha `results-credits` com `+N`. Toda a fala da loja está em `src/i18n/en.json` e
`src/i18n/zh-CN.json` (147 → **195 chaves cada**), e `renderHangar()` traduz só a própria subárvore
(chamar `translate()` ali dentro causaria recursão).

`src/styles/main.css` foi de 388 para 527 linhas com o bloco do hangar.

### Save

`src/engine/save.ts` subiu para **v2**: `SaveData` ganhou `credits`, `weapons`,
`weapon`, `ships`, `ship` (exatamente as chaves que `loadoutOf` lê e que `persist()` grava), com
saneamento por `slugList()` (dedup, ≤12, `/^[a-z][a-z0-9-]{0,15}$/`) e `levelMap()` (0–9, descarta
≤0). Saves antigos continuam caindo nos padrões — a migração não foi escrita, o que é aceitável
porque a carteira antiga era inexistente.

### Verificação

`pnpm typecheck` limpo · `pnpm test` **8 arquivos / 64 testes verdes** · `pnpm build` ok ·
`pnpm smoke` **verde nas três fases** com os seletores novos de título/resultados.

Bug encontrado e corrigido no passe de browser: `Trail.setColor()` era chamado no construtor antes
de `geometry.setAttribute('color', …)` existir, então `this.geo.getAttribute('color').needsUpdate`
estourava e o jogo nem subia (`Launch error` na tela) — a ordem foi invertida e o acesso ficou
guardado.

Passe de browser (Chromium headless + SwiftShader, 1280×720 e zh-CN): abrir o hangar **só pelo
teclado**; comprar `scatter` e subir até o nível 3 (carteira 250.000 → 240.500, arma equipada e
nível 3 no jogo); comprar `kite` (→ 224.000, casco equipado, hull 92 / shield 118 / velocidade 16
em voo); comprar `rail` pelo teclado e `bastion` por toque (→ 168 de hull, 74 de shield, 1,9 de
raspão, projéteis `slug` no ar); run de 100.000 pontos morrendo de propósito → resultados mostram
`CREDITS EARNED +20,000` e a carteira 0 → 20.000; zh-CN com nomes 彗星/棱堡/纸鸢, 购买 18,000 e
已装备, comprando `vesper` (40.000 → 28.000). Sem erros de console em nenhuma passagem.
Capturas: `shots/` (21 PNGs + `galeria.html`).

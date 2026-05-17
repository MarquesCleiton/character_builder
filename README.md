# Character Builder

Ferramenta web para composição de personagens 2D em camadas PNG, com ajuste fino de posicionamento, exportação de alta resolução e suporte a template de referência.

**Demo online:** [marquescleiton.github.io/character_builder](https://marquescleiton.github.io/character_builder/)

---

## Índice

1. [Funcionalidades](#funcionalidades)
2. [Como usar a versão Web](#como-usar-a-versão-web)
3. [Executar localmente](#executar-localmente)
4. [Estrutura do projeto](#estrutura-do-projeto)
5. [Geração de assets com IA](#geração-de-assets-com-ia)

---

## Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| **Projeto local** | Todo dado fica na pasta escolhida pelo usuário — sem servidor, sem nuvem |
| **Template de dimensão** | Imagem de referência que define a resolução final da exportação automaticamente |
| **Prévia em tempo real** | Canvas interativo com pan, zoom por roda do mouse (ponto fixo no cursor) e botão Centralizar |
| **Ajuste fino de elemento** | Mover, rotacionar, escalar e recortar cada asset antes de adicioná-lo ao projeto |
| **Gerenciamento de camadas** | Reordenar e ocultar camadas arrastando itens no painel |
| **Galeria de assets** | Visualização em grade com remoção e edição de elementos |
| **Exportação PNG** | Arquivo salvo via File System Access API — o usuário escolhe a pasta de destino |
| **Copiar para clipboard** | Copia o PNG diretamente para a área de transferência |
| **Randomizar** | Seleciona aleatoriamente um asset de cada categoria (respeitando bloqueios) |
| **Bloqueio de categoria** | Trava uma categoria para que o randomize não a altere |
| **Tema claro/escuro** | Preferência salva localmente |
| **PWA** | Funciona offline após o primeiro acesso |

---

## Como usar a versão Web

### 1. Acessar o app

Abra [marquescleiton.github.io/character_builder](https://marquescleiton.github.io/character_builder/) em um navegador baseado em Chromium (Chrome, Edge, Arc). O Firefox tem suporte parcial (sem salvar diretamente, mas funciona com download automático).

> **PWA:** Na barra de endereço, clique em "Instalar aplicativo" para usar offline como um app nativo.

---

### 2. Criar ou abrir um projeto

Na **tela de boas-vindas**:

- **Criar Projeto** — escolha uma pasta vazia no seu computador. O app cria automaticamente a estrutura de subpastas e o arquivo `project.json`.
- **Abrir Pasta** — selecione uma pasta de projeto já existente.

> A pasta do projeto serve como banco de dados local. Todos os assets importados são copiados para dentro dela automaticamente.

---

### 3. Configurar o template

Clique no botão **Projeto** (ícone de engrenagem) na barra superior e:

- **Nome do Projeto** — renomeie o projeto e confirme com Enter ou "Salvar".
- **Alterar Template** — escolha uma imagem PNG/JPG que representa o template final do personagem. As dimensões dessa imagem definem automaticamente a resolução de exportação e o canvas de todas as prévias.

---

### 4. Importar assets

Na coluna **Personalizar**, cada categoria possui um botão de importação. Clique nele e selecione um arquivo de imagem (PNG recomendado com transparência).

Ao importar, o app abre a tela de **Ajuste Fino**, onde você pode:

| Controle | Ação |
|---|---|
| Arraste a imagem | Move o elemento |
| Canto NW (●) | Rotaciona o elemento |
| Demais cantos (■) | Escala o elemento |
| Slider Zoom | Ajusta a escala numericamente |
| Slider Rotação | Ajusta a rotação numericamente |
| Recortar imagem | Abre modo de recorte (arraste para selecionar área) |
| Opacidade do template | Ajusta a transparência da imagem de referência |
| Centralizar | Posiciona o elemento no centro do canvas |
| Resetar | Volta ao estado inicial |

Após posicionar, clique em **Salvar elemento** para confirmar.

---

### 5. Compor o personagem

Na coluna esquerda (**Prévia**):

- **Pan:** clique e arraste no canvas
- **Zoom:** role o mouse (o ponto fixo é a posição do cursor)
- **Centralizar:** botão abaixo do canvas para ajustar a visualização
- **Botões +/-:** zoom aplicado a partir do centro
- **Template:** botão de visibilidade e slider de opacidade para sobrepor a imagem de referência

No painel de **Camadas** (abaixo da prévia):
- Arraste para reordenar a ordem de renderização
- Clique no olho para ocultar/exibir uma categoria

Na coluna direita (**Personalizar**):
- Use os botões ‹ › para navegar entre assets da categoria
- Clique em **Ver todos** para abrir a galeria completa
- Clique no cadeado para travar a categoria no randomize
- Clique em ✏️ para editar o ajuste fino de um asset existente
- Clique no ícone de lixeira para remover um asset

---

### 6. Exportar

- **Copiar PNG** (coluna esquerda) — copia a imagem para a área de transferência
- **Salvar PNG** (coluna esquerda ou botão **Exportar PNG** na topbar) — abre o seletor de arquivo do sistema para escolher onde salvar

> A resolução do PNG exportado é determinada pelas dimensões da imagem de template configurada. Sem template, usa 1536 × 2752 px.

---

## Executar localmente

**Pré-requisitos:** Node.js 18+

```bash
# Instalar dependências
npm install

# Servidor de desenvolvimento (http://localhost:4200)
npm start

# Build de produção
npm run build
```

---

## Estrutura do projeto

```
src/app/
├── domain/models/          # Tipos e entidades (ProjectManifest, AssetItem…)
├── infrastructure/
│   ├── services/           # Export, ImageLoader, WorkspaceFiles, Theme
│   └── state/              # WorkspaceStore (estado reativo via BehaviorSubject)
├── presentation/
│   ├── components/         # Topbar, PreviewCanvas, CategoryBrowser, LayersPanel…
│   └── pages/              # WelcomePage, EditorPage, AjustarElementoPage
└── shared/constants/       # Constantes de exportação, camadas e UI
```

---

## Geração de assets com IA

Use os prompts abaixo em qualquer ferramenta de geração de imagens com IA para criar folhas de sprites de cada grupo de elementos do personagem.

**Ferramentas sugeridas:** ChatGPT (DALL-E), Midjourney, Leonardo AI, Adobe Firefly, Stable Diffusion

### Como usar

1. Abra sua ferramenta de IA favorita
2. **Opcional — referência de estilo:** anexe sua imagem template junto com o prompt para que a IA replique o estilo visual (funciona no ChatGPT, Midjourney com `--sref URL`, Leonardo AI, etc.)
3. Cole o prompt do grupo desejado
4. Baixe a imagem gerada (grid completo em um único arquivo)
5. Fatie cada célula individualmente em um editor de imagem (Photoshop, GIMP, Krita, etc.)
6. Importe cada PNG no Character Builder

> **Dica:** Use o mesmo prompt pedindo "generate a new variation" para obter grids adicionais com estilos diferentes.

---

### Prompt 1 — Olhos + Sobrancelhas · grid 5 × 4 (20 variações)

```
Create a sprite sheet with a 5-column by 4-row grid (20 total cells) for a 2D cartoon character builder.

Each cell contains ONE isolated variation of EYES and EYEBROWS — no nose, no mouth, no jaw, no hair, no neck, no full face.

Requirements:
- 20 distinct variations: different shapes, sizes, expressions, and styles (surprised, sleepy, angry, happy, etc.)
- Pure white or fully transparent background per cell
- Each element perfectly centered in its cell with even padding on all sides
- Consistent cell size throughout the entire sheet
- Clean flat illustration or cartoon style — no photorealism
- No borders, dividing lines, labels, or numbers between cells

Grid layout: 5 columns × 4 rows
```

---

### Prompt 2 — Boca + Nariz · grid 5 × 4 (20 variações)

```
Create a sprite sheet with a 5-column by 4-row grid (20 total cells) for a 2D cartoon character builder.

Each cell contains ONE isolated variation of MOUTH and NOSE together — no eyes, no eyebrows, no ears, no chin outline, no hair.

Requirements:
- 20 distinct variations: different shapes, sizes, expressions, and styles (smiling, open, frowning, surprised, etc.)
- Pure white or fully transparent background per cell
- Each element perfectly centered in its cell with even padding on all sides
- Consistent cell size throughout the entire sheet
- Clean flat illustration or cartoon style — no photorealism
- No borders, dividing lines, labels, or numbers between cells

Grid layout: 5 columns × 4 rows
```

---

### Prompt 3 — Cabelo, Cabeça, Torso e Braços · grid 2 × 4 (8 variações)

```
Create a sprite sheet with a 2-column by 4-row grid (8 total cells) for a 2D cartoon character builder.

Each cell contains ONE full upper-body variation of a character including: HAIR, HEAD SILHOUETTE, TORSO, and ARMS — but WITHOUT any facial features (no eyes, no nose, no mouth, no eyebrows). The face area must be completely blank/empty.

Requirements:
- 8 distinct variations: different hairstyles, body types, clothing, arm poses
- Pure white or fully transparent background per cell
- Character centered in its cell, showing from head to waist or hip level
- Consistent cell size throughout the entire sheet
- Clean flat illustration or cartoon style — no photorealism
- No borders, dividing lines, labels, or numbers between cells

Grid layout: 2 columns × 4 rows
```

---

### Prompt 4 — Pernas + Pés · grid 2 × 4 (8 variações)

```
Create a sprite sheet with a 2-column by 4-row grid (8 total cells) for a 2D cartoon character builder.

Each cell contains ONE isolated variation of LEGS and FEET — showing from the hip or waist down, including pants, skirt, or bare legs, and shoes or bare feet. No torso, no arms, no head.

Requirements:
- 8 distinct variations: different stances, clothing styles, shoe types, and proportions
- Pure white or fully transparent background per cell
- Each element perfectly centered in its cell with even padding on all sides
- Consistent cell size throughout the entire sheet
- Clean flat illustration or cartoon style — no photorealism
- No borders, dividing lines, labels, or numbers between cells

Grid layout: 2 columns × 4 rows
```

---

### Fluxo recomendado

```
Template PNG (referência de estilo)
         │
         ├─ Prompt 1 → Gera grid 5×4 → fatiar 20 PNGs → importar olhos/sobrancelhas
         ├─ Prompt 2 → Gera grid 5×4 → fatiar 20 PNGs → importar boca/nariz
         ├─ Prompt 3 → Gera grid 2×4 → fatiar 8 PNGs  → importar cabeça/torso
         └─ Prompt 4 → Gera grid 2×4 → fatiar 8 PNGs  → importar pernas/pés
                                │
                                ▼
                    Character Builder (ajustar + compor)
                                │
                                ▼
                        Exportar PNG final
```

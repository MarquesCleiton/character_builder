# Character Builder

**Refinamento Tecnico e Funcional**

Pipeline modular de producao e composicao de personagens 2D.

---

## 1) Visao geral
O projeto e uma plataforma local e leve para criacao de personagens 2D por camadas PNG transparentes. Nao gera personagens por IA no app. A IA e usada apenas para criar os assets brutos.

**Responsabilidades do app:**
- organizar assets
- importar sheets
- recortar elementos
- alinhar elementos
- padronizar assets
- montar personagens
- randomizar combinacoes
- exportar PNG final transparente

O foco principal e padronizar assets inconsistentes gerados por IA em uma biblioteca modular consistente e reutilizavel.

---

## 2) Objetivo principal
Permitir que qualquer usuario consiga:
- gerar assets via IA
- importar esses assets
- padronizar posicionamento
- montar personagens modulares
- salvar bibliotecas reutilizaveis
- criar multiplas combinacoes rapidamente

**Sem necessidade de:**
- Photoshop
- edicao manual complexa
- recortes externos
- software profissional

---

## 3) Conceito central
O projeto funciona como uma pipeline de producao modular. A IA gera conteudo bruto. O aplicativo transforma esse conteudo bruto em componentes reutilizaveis. O editor final apenas compoe as partes.

---

## 4) Regras criticas de resolucao e alinhamento
- Resolucao oficial: 1536x2752 (9:16)
- Todos os assets devem ter exatamente o mesmo tamanho de canvas
- O editor apenas empilha camadas, sem reposicionamento automatico

**Motivo:** elimina calculos de alinhamento, diferencas de escala, problemas de proporcao e perspectiva.

---

## 5) Arquitetura base do personagem
**Categorias modulares:**
- Torso (inclui cabeca e bracos)
- Olhos
- Boca e Nariz (uma unica layer)
- Pernas

**Ordem de renderizacao:**
Pernas -> Torso -> Boca -> Olhos

---

## 6) Estrutura do workspace
Cada projeto e um pacote local. Estrutura obrigatoria:

```
PacotePersonagem/
|
|-- manifesto.json
|-- torso/
|   |-- torso_001.png
|-- olhos/
|   |-- olhos_001.png
|-- boca/
|   |-- boca_001.png
|-- pernas/
|   |-- pernas_001.png
|-- templat/
|   |-- template_mestre.png
```

**Regra:** a pasta `templat` e obrigatoria em todos os projetos. O usuario pode trocar o template mestre a qualquer momento.

---

## 7) Manifesto (estrutura completa)
O manifesto deve ser leve e conter somente referencias a arquivos locais. Nenhuma imagem em base64.

**Campos obrigatorios:**
- nome, versao
- larguraCanvas, alturaCanvas
- camadas
- imagemGabarito (arquivo na pasta `templat`)
- elementos por categoria (com caminho do arquivo)
- ultimaSelecao
- bloqueios
- historico (snapshot do estado atual)

**Exemplo de manifesto (modelo conceitual):**

```json
{
  "nome": "Projeto Exemplo",
  "versao": "1.0.0",
  "larguraCanvas": 1536,
  "alturaCanvas": 2752,
  "camadas": ["pernas", "torso", "boca", "olhos"],
  "imagemGabarito": "templat/template_mestre.png",
  "elementos": {
    "olhos": [
      {
        "id": "uuid",
        "categoria": "olhos",
        "nome": "olhos_001.png",
        "arquivo": "olhos/olhos_001.png",
        "transformacao": { "x": 0, "y": 0, "escala": 1, "rotacao": 0 },
        "criadoEm": "2026-05-17T00:00:00.000Z"
      }
    ],
    "boca": [],
    "torso": [],
    "pernas": []
  },
  "ultimaSelecao": {
    "olhos": "uuid",
    "boca": "",
    "torso": "",
    "pernas": ""
  },
  "bloqueios": {
    "olhos": false,
    "boca": false,
    "torso": false,
    "pernas": false
  },
  "historico": [
    {
      "data": "2026-05-17T00:00:00.000Z",
      "snapshot": {
        "ultimaSelecao": { "olhos": "uuid", "boca": "", "torso": "", "pernas": "" },
        "bloqueios": { "olhos": false, "boca": false, "torso": false, "pernas": false }
      }
    }
  ]
}
```

---

## 8) Conceito de sheets
O sistema nao deve trabalhar com assets unitarios. O metodo correto e trabalhar com sheets.

**Exemplo:** 16 olhos em uma unica imagem.

**Motivo:** a IA tem dificuldade de manter consistencia, alinhamento, escala e perspectiva. Gerar varios elementos na mesma imagem preserva estilo e proporcao.

---

## 9) Pipeline de producao
1. Gerar sheet via IA
2. Importar no aplicativo
3. Separar elementos (slicing manual)
4. Ajustar alinhamento
5. Salvar assets padronizados
6. Usar assets no editor final

---

## 10) Telas principais
### Tela 1 — Tela inicial (unificada)
- Um unico botao: Criar ou abrir pacote
- Seleciona a pasta local do workspace
- Se manifest existir, carrega tudo
- Se nao existir, pede nome e cria o pacote completo

### Tela 2 — Editor de personagem
- Preview com fundo quadriculado, zoom e pan
- Camadas com navegacao, miniaturas, lock e randomizacao
- Galeria por categoria (grid)
- Exportacao PNG 1536x2752 com transparencia

### Tela 3 — Importador de assets
- Dividido em 3 areas
  - esquerda: preview da sheet com grid e slicing
  - centro: editor do asset com template mestre do workspace
  - direita: ferramentas de transformacao
- Ferramentas: mover, escalar, rotacionar, flip, opacidade, reset
- Snap com linhas guia e centro magnetico

**Fluxo do importador:**
1. Upload da sheet
2. Categoria
3. Definicao do grid
4. Ajuste do grid (padding, spacing, tamanho)
5. Selecionar celula
6. Ajuste manual
7. Salvamento (PNG padronizado na pasta correta)

---

## 11) Sistema de salvamento
- Assets salvos automaticamente nas pastas do workspace
- Ao salvar, asset aparece imediatamente no editor principal
- Todas as operacoes sao locais e leves

---

## 12) Prompts de referencia (IA)

**Prompt do torso (base):**
```
Create a full-body cartoon character facing forward in a neutral standing pose.
The character must:
- be centered
- occupy most of the vertical canvas
- maintain consistent proportions
- use clean cartoon lineart
- use soft shading
- use transparent background
- be fully visible with no cropping
- use a 9:16 vertical composition
The character must include:
- hair
- head
- torso
- arms
The face must contain:
- NO eyes
- NO eyebrows
- NO nose
- NO mouth
The face area must remain completely empty and clean for modular facial layers.
Render in ultra high quality 1536x2752 resolution.
```

**Prompt da sheet de olhos:**
```
Create a clean 4x4 grid containing 16 different cartoon eye expressions for the EXACT SAME character.
Requirements:
- every eye pair must have identical size
- every eye pair must have identical position
- same perspective
- same lighting
- same line thickness
- same art style
- centered alignment inside each cell
- equal spacing between all cells
- transparent background
- no head
- no face
- no extra elements
- eyes only
Each variation should only change:
- expression
- eyelids
- eyebrow shape
The image must look like a professional sprite sheet.
Ultra clean layout.
```

**Prompt da sheet de boca:**
```
Create a clean 4x4 grid containing 16 different cartoon mouth and nose expressions for the EXACT SAME character.
Requirements:
- identical size
- identical alignment
- same perspective
- same art style
- same lighting
- centered in every cell
- transparent background
Only change:
- mouth expression
- nose variation
Professional sprite sheet layout.
```

**Prompt da sheet de pernas:**
```
Create a clean 4x4 grid containing 16 different cartoon leg poses for the EXACT SAME character.
Requirements:
- identical proportions
- identical scale
- same perspective
- same line thickness
- same lighting
- transparent background
Only change:
- lower body pose
- leg position
Professional sprite sheet layout.
```

---

## 13) MVP recomendado
**FAZER APENAS:**
- carregar pacote
- importar sheet
- slicing manual
- alinhamento manual
- troca de layers
- randomizacao
- exportacao PNG

**NAO FAZER NO MVP:**
- IA integrada
- geracao procedural
- multiplayer
- login
- sistema online
- sincronizacao cloud
- automacao inteligente

---

## Conclusao
O verdadeiro valor do projeto nao esta apenas no editor de personagem. O valor real esta na pipeline de padronizacao de assets gerados por IA, tornando a producao consistente, reutilizavel e simples para qualquer pessoa.

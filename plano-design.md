# Estado do Mundo — plano de design

Versão 2 (revista após a primeira leitura do cliente). Este ficheiro é a
referência de design do projeto; o código segue-o.

## Conceito

Uma sala de arquivo de um posto de vigilância. Paredes de azulejo
verde-oliva sujo, uma lâmpada fluorescente cansada. Na parede, um monitor de
sinais vitais ligado ao planeta. Na mesa, dossiers em papel, escritos à
máquina e carimbados.

A decisão central: **a sala é escura, os documentos são de papel claro.** A
página não é um "dashboard escuro com acento": é papel físico debaixo de luz
má. O escuro é ambiente; o conteúdo vive no papel.

## Paleta

As cores de estado existem em duas versões, porque nenhuma cor serve ao mesmo
tempo sobre o fundo escuro e sobre o papel. Cada versão só é usada na
superfície onde passa os limiares WCAG.

| Nome | Hex | Superfície | Papel |
|---|---|---|---|
| Azulejo de corredor | `#1F2119` | — | Fundo da sala (oliva-castanho, nunca preto) |
| Luz de tubo | `#D6D1B1` | escuro | Texto principal sobre o fundo |
| Luz baixa | `#A6A084` | escuro | Texto secundário sobre o fundo (horas, fontes) |
| Papel de arquivo | `#CDC2A2` | — | Superfície dos dossiers |
| Tinta de fita | `#2B2519` | papel | Texto e gráficos sobre o papel |
| Tinta gasta | `#4A4536` | papel | Texto secundário sobre o papel |
| Verde-doente | `#8EA35B` | escuro | ESTÁVEL no monitor e no inventário |
| Âmbar | `#C68A2E` | escuro | CUIDADO no monitor e no inventário |
| Sinal vermelho | `#E0705A` | escuro | PERIGO no monitor (linha do ECG e palavra de estado) |
| Verde de carimbo | `#384D1C` | papel | Carimbo ESTÁVEL |
| Âmbar de carimbo | `#663D0B` | papel | Carimbo CUIDADO |
| Sangue seco | `#8A2C20` | papel | Carimbo PERIGO e valores acima de limiar no papel |

### O estado nunca depende só da cor

Cada estado tem também uma forma, desenhada em SVG ao lado da palavra, no
monitor, no inventário e nos carimbos:

- ESTÁVEL — círculo cheio
- CUIDADO — triângulo
- PERIGO — losango com cruz
- DADOS DESATUALIZADOS — quadrado tracejado (cor: tinta de fita)

### Contraste (WCAG 2.x, calculado por script)

Limiares: ≥ 4,5:1 para texto; ≥ 3:1 para elementos gráficos e carimbos
grandes. Os carimbos levam texto, por isso são tratados como texto (4,5:1).
O teste `test/contrast.test.mjs` lê `config/palette.json` e falha o build se
algum par ficar abaixo do limiar.

| Primeiro plano | Fundo | Rácio | Uso | Limiar |
|---|---|---|---|---|
| Luz de tubo `#D6D1B1` | Azulejo `#1F2119` | 10,56 | texto | 4,5 |
| Luz baixa `#A6A084` | Azulejo `#1F2119` | 6,19 | texto | 4,5 |
| Verde-doente `#8EA35B` | Azulejo `#1F2119` | 5,85 | texto | 4,5 |
| Âmbar `#C68A2E` | Azulejo `#1F2119` | 5,49 | texto | 4,5 |
| Sinal vermelho `#E0705A` | Azulejo `#1F2119` | 5,14 | texto | 4,5 |
| Tinta de fita `#2B2519` | Papel `#CDC2A2` | 8,57 | texto | 4,5 |
| Tinta gasta `#4A4536` | Papel `#CDC2A2` | 5,39 | texto | 4,5 |
| Verde de carimbo `#384D1C` | Papel `#CDC2A2` | 5,27 | carimbo | 4,5 |
| Âmbar de carimbo `#663D0B` | Papel `#CDC2A2` | 5,29 | carimbo | 4,5 |
| Sangue seco `#8A2C20` | Papel `#CDC2A2` | 4,81 | carimbo / texto | 4,5 |

Pares proibidos (não passam e não são usados): verde-doente, âmbar e sinal
vermelho sobre papel (1,6–1,9:1); sangue seco sobre o fundo escuro (1,9:1).

O grão e a vinheta baixam o contraste efetivo. Depois de construir, o
contraste foi medido de novo sobre o resultado renderizado
(`scripts/measure-contrast.mjs`: amostra píxeis de faixas vazias de cada
superfície e compara cada cor de texto com o pior píxel de fundo).

Resultado da primeira medição: a Luz baixa original (`#9A9478`, 5,33:1 nos
hex) descia para 4,52:1 no cabeçalho, onde a vinheta é mais clara e o grão
acrescenta luz. Ficava no limite, por isso passou para `#A6A084` (6,19:1 nos
hex, 5,24:1 no pior píxel renderizado). O papel não leva grão e mede o mesmo
que os hex. Todos os pares renderizados ficam ≥ 4,8:1.

## Revisão final

Decoração removida antes da entrega: a sombra difusa por baixo das folhas de
papel. Era o "cartão com sombra" genérico e não dizia nada; a folha clara
sobre o fundo escuro já se separa sozinha.

## Tipografia

- **Courier Prime** — o texto dos documentos: corpo, manchetes, fontes,
  notas. Mais legível que a Special Elite em blocos longos. Medida máxima de
  66 caracteres, entrelinha 1,55.
- **Big Shoulders Display** (800, condensada) — nomes dos dossiers, números
  grandes, a palavra de estado do monitor, as quantidades do inventário.
  A variante **Big Shoulders Stencil Display**, da mesma família, fica
  reservada aos carimbos de borracha. É a letra de caixotes de armazém, que
  é o mundo do inventário.
- Escala: 14 / 16 / 21 / 28 / 44 / 96 px (razão ≈ 1,33; o 96 existe só para
  a palavra de estado).
- **Maiúsculas só em carimbos** (ESTÁVEL, CUIDADO, PERIGO, DADOS
  DESATUALIZADOS), porque um carimbo de borracha é, por natureza, uma
  palavra curta em maiúsculas que se lê de relance; usá-las noutros sítios
  (títulos, etiquetas, botões) tirava-lhes esse peso e transformava-as em
  ruído de template. Todo o resto vai em caixa de frase.

## Layout

### Desktop (≥ 960 px)

```
┌──────────────────────────────────────────────────────────────────┐
│  [insígnia] Estado do Mundo                  atualizado 14:32 UTC│
├──────────────────────────────────────────────────────────────────┤
│   ╭─ monitor ─────────────────────────────────────────────────╮  │
│   │  ___/\____/\_______/\____/\_______  (linha animada)        │  │
│   │  ▲ CUIDADO                      índice 58 de 100           │  │
│   │                                 ritmo 96 por minuto        │  │
│   │                                 Como se calcula            │  │
│   ╰────────────────────────────────────────────────────────────╯  │
│   ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐   inventário: casas quadradas,        │
│   │◆ ││▲ ││≈ ││$ ││⌛ ││✂ │   ícone SVG original, quantidade      │
│   │38││4 ││12││3%││85s││9k│   no canto, como contagem de itens    │
│   └──┘└──┘└──┘└──┘└──┘└──┘                                        │
├────────────────────┬─────────────────────────────────────────────┤
│ Registos           │ ┌─ separador ─┐                              │
│                    │ │ Conflitos   │ arquivado 23 out 2026        │
│ ▸ Conflitos armados│ ├─────────────┴──────────────────┐ [carimbo] │
│   14:30, 2 vivas   │ │ papel                           │           │
│   Trabalho e IA    │ │ curva de cobertura (série)      │           │
│   14:30, atrasada  │ │ manchetes: título, fonte, data  │           │
│   Planeta          │ │ atribuição UCDP (CC BY 4.0)     │           │
│   14:31, viva      │ └─────────────────────────────────┘           │
│   Economia         │                                              │
│   ontem, lenta     │                                              │
│   O que aí vem     │                                              │
└────────────────────┴─────────────────────────────────────────────┘
```

### Mobile (< 960 px)

```
┌──────────────────────┐
│ Estado do Mundo      │
│ ╭ monitor ─────────╮ │
│ │ __/\___/\___     │ │
│ │ ▲ CUIDADO   58   │ │
│ ╰──────────────────╯ │
│ ┌──┐┌──┐┌──┐         │
│ └──┘└──┘└──┘  (3×2)  │
│ ▸ Conflitos armados  │  lista empilhada; cada entrada
│   [papel aberto]     │  abre o dossier logo abaixo
│ ▸ Trabalho e IA      │
│ ▸ Planeta            │
└──────────────────────┘
```

- **Alinhamento:** tudo alinhado à esquerda, exceto o conteúdo de cada casa
  do inventário (ícone centrado na casa, quantidade no canto inferior
  direito), porque uma casa de inventário é um objeto quadrado que se lê
  como um todo, não como uma linha de texto.
- **Lista de registos:** imita o ecrã de gravação. Cada entrada mostra o que
  um *save slot* mostra: o nome do local, a hora do último registo e o
  estado das fontes. Não leva números porque os dossiers não são uma
  sequência: podem ler-se por qualquer ordem, e numerá-los sugeriria uma
  ordem ou uma prioridade que não existe.
- **Numeração** só existe onde o conteúdo é uma sequência: o histórico do
  Doomsday Clock (por ano) e os horizontes ordenados por data.
- **Dossier:** uma folha de papel com separador (nome e data de arquivo),
  carimbo de estado no canto e atribuição da fonte ao pé, à máquina.
- **Mapa:** SVG equirretangular desenhado a tinta sobre o papel (contorno
  Natural Earth simplificado, domínio público). Sismos como pontos com área
  proporcional à magnitude; eventos EONET como cruzes. Sem biblioteca.

## Princípios

1. **Um único movimento.** Só o ECG se mexe. Com `prefers-reduced-motion`,
   a linha fica parada (um traçado completo, desenhado de uma vez) e o
   estado continua escrito por extenso ao lado, com a sua forma: nenhuma
   informação depende da animação.
2. **A cor é um dado.** Verde, âmbar e vermelho só aparecem quando um valor
   os justifica. Um dossier calmo fica todo em tinta sobre papel.
3. **Papel na sala escura.** O conteúdo vive no papel; o escuro é só o
   ambiente.
4. **Honestidade visível.** Cada número leva fonte e data. Um dado em falta
   tem uma explicação escrita à máquina, nunca um espaço vazio.
5. **Textura parada.** Grão e vinheta são estáticos (ruído SVG e gradiente
   radial em CSS, desenhados uma vez): sem cintilação da lâmpada, sem grão
   animado, sem qualquer movimento de textura.

## Passagem 2 — revisão contra o brief

1. **Fundo escuro com um acento vivo** (o default nº 2 dos painéis gerados).
   A primeira ideia era fundo verde-escuro com texto claro em todo o lado e
   o vermelho como único acento. Mudei para fundo escuro só na "sala" e
   dossiers em papel claro: cumpre o brief (fundo escuro, verdes e castanhos
   sujos, nunca preto) e dá à página uma superfície material que um
   dashboard genérico não tem.
2. **Monoespaçada para etiquetas de dados.** A Courier Prime é
   monoespaçada; usá-la também nos números pequenos seria o tique genérico.
   Os números e quantidades vão em Big Shoulders; a Courier fica só para a
   escrita à máquina dos documentos.
3. **Herói "número grande + etiqueta pequena".** A primeira versão punha o
   índice enorme. Mudei: a peça grande é a linha e a palavra de estado; o
   número é secundário, porque o índice é editorial e não deve parecer uma
   medição exata.
4. **Cintilação fluorescente animada.** Gastaria o orçamento de movimento
   que pertence ao ECG. Cortada: a luz de corredor fica só na cor e numa
   vinheta estática.
5. **Metadados "A · B · C" e eyebrows.** A data de arquivo, a fonte e o
   estado ficam em sítios fixos do papel — data no separador, estado no
   carimbo, fonte e licença no rodapé da folha — em vez de numa linha de
   texto pequeno com pontos por cima de cada título.
6. **Carimbos em todos os dossiers.** Podiam virar decoração. Regra: o
   carimbo diz sempre o estado real dos dados (ESTÁVEL / CUIDADO / PERIGO /
   DADOS DESATUALIZADOS); num dossier sem estado calculável não há carimbo.
7. **Cartões iguais.** Inventário em casas quadradas rígidas, dossiers como
   folhas, monitor com moldura própria: três formas para três funções.

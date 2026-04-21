# Vallen Maquininha

App Android para maquininhas PagBank (PlugPag) do PDV Vallen. Roda em modo "quiosque" na maquininha, permite ao cliente montar o carrinho, ler códigos de barras e pagar via crédito/débito/Pix.

## Stack

- **Kotlin** + **Jetpack Compose** (Material3) — UI 100% declarativa
- **Navigation Compose** — grafo de telas
- **Supabase Kotlin** (`supabase-kt` 3.0.2) — Postgrest, Auth, Realtime, Storage
- **Ktor OkHttp engine** — cliente HTTP (necessário; `ktor-client-android` tem problema de keep-alive em alguns dispositivos)
- **DataStore Preferences** — persistência local (franqueado/unidade/terminal/flags)
- **PlugPag** — SDK de pagamento PagBank/PagSeguro (integração via `PaymentProcessor`)
- **minSdk 24 / targetSdk 36** — Java 11

## Funcionalidades

### 1. Login e multi-tenant
- `LoginScreen` — autenticação Supabase (email + senha)
- `SelectFranqueadoScreen` — usuário escolhe o franqueado ao qual está vinculado (tabela `usuario_franqueado`)
- `SelectUnidadeScreen` — escolhe a unidade/loja dentro do franqueado
- `SetupScreen` — associa este terminal físico a um registro em `terminais` (nome + serial)
- Todos os IDs persistem em `Prefs` (DataStore). Próximos boots vão direto pra `WelcomeScreen`.

### 2. Fluxo de compra
- `WelcomeScreen` — tela de splash "toque para começar"
- `EmptyCartScreen` — entrada do cliente. Botão único "Escolher produtos"
- `HomeScreen` — catálogo (vem de `planograma` filtrado pela unidade) + busca por nome + filtro de categoria + **scanner de código de barras** (câmera ou hardware)
- `CartScreen` — revisão do carrinho, alterar quantidades, remover
- Botão "Cancelar" em qualquer tela limpa o carrinho e volta ao Welcome

### 3. Scanner de código de barras
- `BarcodeScanner` — StateFlow que emite códigos lidos
- Consulta `ProdutosRepository.porCodigoBarras(unidadeId, codigo)` no planograma da loja
- Se o código **não está** no planograma: registra em `pendencias_planograma` para o admin revisar depois

### 4. Pagamento
- `PaymentMethodScreen` — cliente escolhe Crédito, Débito ou Pix
- `PaymentScreen` — dispara o `PaymentProcessor` (PlugPag) com o total do carrinho
- `PagBankIntents` — camada fina para startActivityForResult nos Intents do PlugPag
- `PedidosRepository` — cria `pedido` + `itens_pedido` no Supabase antes de chamar PlugPag; atualiza status + NSU/bandeira após retorno
- `ResultScreen` — aprovado/negado com valor e NSU

### 5. Verificação de idade (+18)
Gate global em `AgeCheckGate` (singleton com StateFlow) intermedeia home/scanner e a tela de verificação:
- Produto marcado `restrito_idade=true` em `produtos` pede CPF + dia + mês ao **adicionar** (não no checkout)
- Se o CPF existe em `clientes` e a data bate e idade ≥ 18: aprova, marca `CartStore.ageVerified = true` e adiciona
- Se o CPF é novo: abre modal para nome + ano + celular; cadastra em `clientes` com `unidade_id`
- Se recusa/cancela: item NÃO é adicionado, banner vermelho "VENDA DE PRODUTO MAIOR DE 18 NÃO AUTORIZADO" aparece no Home
- Uma vez validado na sessão, segue adicionando outras restritas sem repetir. `CartStore.clear()` ou remover o último item restrito reseta.
- Pode ser desligado em Configurações (toggle `ageCheckEnabled` em `Prefs`)

### 6. Configurações (easter egg)
- `SettingsEasterEgg` — 5 toques no logo em menos de 3s abre o painel
- Senha de técnico: `1234`
- Ações:
  - **Controle de idade** — toggle liga/desliga verificação +18
  - **Pendências do planograma** — lista de códigos lidos que não estão cadastrados
  - **Trocar unidade** — limpa unidade+terminal e volta pra seleção
  - **Reconfigurar terminal** — limpa só o terminal
  - **Sair** — logout + limpa todas as prefs

### 7. Pendências
- `PendenciasScreen` — visualiza códigos de barras lidos fora do catálogo
- Útil pro operador saber quais produtos faltam cadastrar no planograma

## Estrutura

```
app/src/main/java/com/vallen/maquininha/
├── data/                       ← repositories + singletons de estado
│   ├── AuthRepository.kt       ← login/logout Supabase
│   ├── ProdutosRepository.kt   ← consulta planograma
│   ├── PedidosRepository.kt    ← cria/atualiza pedidos
│   ├── PendenciasRepository.kt ← registra códigos fora do catálogo
│   ├── ClientesRepository.kt   ← CRUD de clientes (+18)
│   ├── CartStore.kt            ← estado global do carrinho
│   ├── AgeCheckGate.kt         ← gate singleton do fluxo +18
│   ├── Prefs.kt                ← DataStore (franqueado/unidade/terminal/flags)
│   ├── SupabaseModule.kt       ← client Supabase (timeout 60s, OkHttp engine)
│   └── model/Models.kt         ← data classes serializáveis
├── plugpag/                    ← integração com SDK PagBank
│   ├── PaymentProcessor.kt
│   └── PagBankIntents.kt
├── scanner/                    ← leitor de código de barras
├── ui/
│   ├── auth/         (Login, SelectFranqueado, SelectUnidade)
│   ├── setup/        (Setup do terminal)
│   ├── welcome/
│   ├── cart/         (EmptyCart, Cart)
│   ├── home/         (Home + HomeViewModel)
│   ├── payment/      (PaymentMethod, Payment)
│   ├── result/
│   ├── age/          (AgeVerificationScreen + modal de novo cliente)
│   ├── pendencias/
│   ├── settings/     (SettingsScreen + SettingsEasterEgg)
│   ├── components/   (StatusBar etc.)
│   ├── theme/
│   └── nav/          (NavGraph, Routes)
└── MainActivity.kt
```

## Configuração

Antes de buildar, crie `local.properties` na raiz (copie de `local.properties.example`):

```properties
sdk.dir=/caminho/para/Android/sdk
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=sua-anon-key-publica
PLUGPAG_ACTIVATION_CODE=codigo-de-ativacao-plugpag
```

Essas chaves são injetadas em `BuildConfig` via `build.gradle.kts`.

## Build

```bash
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Requer JDK 17+. Se usar o JBR do Android Studio:
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

## Banco de dados (Supabase)

Tabelas relevantes:
- `franqueados`, `unidades`, `terminais`, `usuario_franqueado`
- `produtos` (catálogo global) + `planograma` (o que cada unidade vende)
- `pedidos`, `itens_pedido`
- `clientes` (CPF + data_nascimento para +18)
- `pendencias_planograma`

RLS: `produtos` tem SELECT público; `clientes` tem SELECT público (para busca por CPF). Demais tabelas exigem auth.

## Rotas de navegação

Definidas em `ui/nav/Routes.kt`:
```
login → select_franqueado → select_unidade → setup → welcome
welcome → empty_cart → home → cart → method → payment/{metodo} → result
                                   ↘ age_verify (modal full-screen)
                                   ↘ pendencias (via settings)
```

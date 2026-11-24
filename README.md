# OpsPilot

Copiloto de plantão para processar solicitações operacionais usando estratégias de raciocínio. A API HTTP expõe `POST /chat` e retorna a resposta junto com o trace e as métricas da execução.

## Requisitos

- Node.js 22 LTS
- npm
- `curl` para os exemplos de API

## Instalação e execução

Instale as dependências:

```bash
npm ci
```

Crie o arquivo local de configuração a partir do exemplo:

```powershell
Copy-Item .env.example .env
```

Configure `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` em `.env` antes de enviar solicitações que usem o modelo. O arquivo `.env` é ignorado pelo Git; mantenha valores de exemplo, sem credenciais, em `.env.example`.

Inicie a API:

```bash
npm run dev
```

O servidor carrega opcionalmente `.env` pelo runtime Node e usa `PORT` quando definido; caso contrário, escuta na porta `3000`. Também é possível fornecer `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` no ambiente do processo. `OPENROUTER_MODEL_FALLBACK` é opcional; se configurado, o modelo principal e o reserva recebem até duas tentativas cada. Quando o reserva produz a resposta, o trace registra o evento `fallback` e `metrics.modelUsed` identifica o modelo utilizado. O código da aplicação não lê `.env` diretamente. Não coloque credenciais neste README nem as versione.

## Persistência operacional

A API persiste serviços, alertas, incidentes e runbooks em SQLite usando `node:sqlite`.
O caminho pode ser configurado pela variável de ambiente `OPSPILOT_DB`; o padrão é
`./data/opspilot.db`. O diretório `/data/` é ignorado pelo Git. O seed é aplicado de forma
idempotente durante a inicialização e pelo comando `npm run seed`.

Testes isolados podem instanciar o store com `:memory:`; cada instância recebe um banco
independente. Os benchmarks continuam usando o mock determinístico em memória e não acessam o
banco persistente.

## Verificações

```bash
npm test
npm run build
npm run typecheck
npm run web:typecheck
npm run web:build
```

`npm run build` executa os typechecks da API e da interface e gera `web/dist/`. Os testes de integração HTTP usam estratégias falsas determinísticas e não chamam serviços externos.

## Publicação no GitHub Pages

O workflow publica somente o console estático em `web/dist/`; ele não hospeda a API. Em **Settings → Pages**, selecione **GitHub Actions** como fonte de publicação. Em cada push para `main`, o workflow configura o Node.js 22, executa `npm ci` e `npm run build` a partir de `web/` e publica somente se a compilação for concluída com sucesso. O workspace web usa o `package-lock.json` da raiz para instalação reproduzível.

O endereço de um site de projeto segue o formato `https://<OWNER>.github.io/<REPOSITORY>/`. Encontre o endereço efetivo em **Settings → Pages** ou no ambiente `github-pages`/deploy da execução bem-sucedida em **Actions**. Falhas de build ou publicação ficam visíveis na execução do workflow; verifique os logs do job que falhou e confirme a configuração de Pages e as permissões de Actions.

O console usa o caminho `/opspilot/` para carregar os assets do site publicado. Para conectar à API, abra **Configurações** na interface e informe a URL base pública. Opcionalmente, configure `VITE_API_BASE_URL` em **Settings → Secrets and variables → Actions → Variables** para pré-preencher esse campo no build; o valor é incorporado ao site e não pode conter credenciais. A API precisa estar implantada separadamente e permitir a origem `https://bvieiradeveloper.github.io`; mantenha chaves de provedores somente no ambiente do servidor da API.

## War Room Web

O console do War Room é um workspace Vite separado, servido sob `/opspilot/`. Para habilitar a integração web, configure uma identidade estável e as origens exatas da interface no ambiente do processo da API:

```powershell
$env:OPSPILOT_USER_ID = "oncall-primary"
$env:OPSPILOT_WEB_ORIGINS = "http://localhost:5173,https://bvieiradeveloper.github.io"
npm run dev
```

Em outro terminal, inicie a interface:

```powershell
npm run web:dev
```

Para produção fora do GitHub Pages, gere os arquivos estáticos com `npm run web:build` e hospede `web/dist/` sob `/opspilot/`. A URL da API é configurável pela interface; `VITE_API_BASE_URL` pode definir o valor público padrão durante o build e não deve conter credenciais ou segredos.

O modo War Room exige `OPSPILOT_USER_ID` e `OPSPILOT_WEB_ORIGINS`; origens devem ser uma lista separada por vírgulas de origens HTTP(S) exatas. Ele habilita CORS restrito e usa o `userId` configurado no servidor, sem solicitar identidade ao navegador. A API não autentica operadores: restrinja o acesso de rede a um perímetro confiável; CORS não é autorização.

Somente requisições HTTP com `Idempotency-Key` usam a identidade War Room, armazenamento de retries e aprovação persistida para mutações de incidentes. Chamadas existentes sem esse header mantêm o contrato explícito de `userId`; os fluxos MCP e CLI não são alterados por essa integração.

## API de chat

Endpoint: `POST http://localhost:3000/chat`

```json
{
  "message": "Liste os alertas ativos do checkout",
  "strategy": "react",
  "reflect": false
}
```

`message` é obrigatório e não pode ficar vazio após o trim. `strategy` pode ser `react` ou `plan-and-execute` e, quando omitido, usa `react`. `reflect` é booleano e, quando omitido, vale `false`.

| Situação | HTTP | Resultado |
|---|---:|---|
| Solicitação processada | `200` | `answer`, `trace` e `metrics` |
| Corpo inválido ou JSON malformado | `400` | Issues de validação ou erro de JSON seguro |
| Estratégia desconhecida | `422` | `UNKNOWN_STRATEGY` |
| Limite de requisições do provedor do modelo | `429` | `MODEL_RATE_LIMITED` |
| Todos os modelos configurados indisponíveis | `503` | `MODEL_UNAVAILABLE` |
| Estratégia excede 180 segundos | `504` | `REQUEST_TIMEOUT` |
| Falha interna da estratégia/servidor | `500` | `INTERNAL_ERROR` sem detalhes internos |

Os exemplos abaixo usam Bash e `curl`. Cada comando mostra os headers e o corpo retornado com `-i`.

### 200: estratégia padrão (`react`)

```bash
curl -i -X POST "http://localhost:3000/chat" -H "Content-Type: application/json" --data-raw '{"message":"Liste os alertas ativos do checkout"}'
```

No Windows PowerShell, `curl` pode ser um alias de `Invoke-WebRequest`. Use `curl.exe` e `--%` para enviar o JSON sem que o PowerShell altere os argumentos:

```powershell
curl.exe --% -i -X POST "http://localhost:3000/chat" -H "Content-Type: application/json" --data-raw "{\"message\":\"Liste os alertas ativos do checkout\"}"
```

### 200: estratégia explícita

```bash
curl -i -X POST "http://localhost:3000/chat" -H "Content-Type: application/json" --data-raw '{"message":"Liste os alertas ativos do checkout","strategy":"plan-and-execute"}'
```

### 200: reflexão habilitada

```bash
curl -i -X POST "http://localhost:3000/chat" -H "Content-Type: application/json" --data-raw '{"message":"Confira se a resposta está apoiada no trace","strategy":"react","reflect":true}'
```

Reflexão pode fazer chamadas adicionais ao modelo e aumentar a duração da solicitação.

### 400: corpo inválido

Este exemplo envia uma mensagem vazia após o trim; a resposta inclui `issues` do Zod.

```bash
curl -i -X POST "http://localhost:3000/chat" -H "Content-Type: application/json" --data-raw '{"message":"   "}'
```

### 400: JSON malformado

```bash
curl -i -X POST "http://localhost:3000/chat" -H "Content-Type: application/json" --data-raw '{"message":'
```

### 422: estratégia desconhecida

```bash
curl -i -X POST "http://localhost:3000/chat" -H "Content-Type: application/json" --data-raw '{"message":"Liste alertas","strategy":"unknown"}'
```

### 429: limite do provedor

O provedor do modelo pode limitar chamadas pela cota da conta ou do modelo configurado. A API responde `429` com um erro seguro; aguarde a renovação da cota ou configure um modelo com disponibilidade:

```json
{
  "error": {
    "code": "MODEL_RATE_LIMITED",
    "message": "The model provider rate limit was reached. Try again later."
  }
}
```

### 504: limite de 180 segundos

```bash
curl --max-time 185 -i -X POST "http://localhost:3000/chat" -H "Content-Type: application/json" --data-raw '{"message":"Processe esta solicitação operacional","strategy":"react"}'
```

O servidor retorna `504` somente se a estratégia continuar executando ao atingir o limite de 180 segundos. `--max-time 185` deixa o `curl` aguardando alguns segundos a mais pela resposta; não força a estratégia a demorar. O teste determinístico do timeout, sem esperar três minutos, está em `src/http/server.test.ts`.

### 500: falha interna por configuração ausente

Para reproduzir em desenvolvimento sem chamar um provedor, abra uma sessão Bash dedicada, remova nela as duas variáveis de configuração e inicie o servidor:

```bash
unset OPENROUTER_API_KEY OPENROUTER_MODEL
npm run dev
```

Em outra sessão, envie uma solicitação válida. A estratégia falhará ao tentar criar o cliente do modelo e a API responderá com `500` e `INTERNAL_ERROR` genérico.

```bash
curl -i -X POST "http://localhost:3000/chat" -H "Content-Type: application/json" --data-raw '{"message":"Liste os alertas ativos"}'
```

Essa falha é apenas um cenário de teste local; feche a sessão dedicada para descartar as alterações de ambiente.
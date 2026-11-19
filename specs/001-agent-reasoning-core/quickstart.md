# Quickstart: Núcleo de Raciocínio do OpsPilot

Este guia descreve validações a executar após implementar a feature. O comando de seed e a arena são adições planejadas e ainda não existem no checkout atual.

## Prerequisites

- Node.js 22 LTS e npm.
- Dependências instaladas com `npm install`.
- Somente para chamadas reais da arena: chave OpenRouter e identificador do modelo. Forneça-os como variáveis de ambiente do processo; não crie nem leia `.env` para esta feature.

No PowerShell, forneça credenciais diretamente ao shell atual sem imprimi-las:

```powershell
$env:OPENROUTER_API_KEY = '<provide-your-key-in-shell>'
$env:OPENROUTER_MODEL = '<supported-model-id>'
```

## Deterministic Checks (No Network)

Execute o script de verificação do seed. Ele inicializa um store in-memory isolado a partir do seed canônico e reporta cinco serviços e seis alertas (três firing, três resolved); os registros process-local são descartados ao término do comando.

```powershell
npm run seed
```

Execute testes e verificação de tipos:

```powershell
npm run test
npm run typecheck
```

Os testes do store e da formatação de trace devem ser determinísticos e não fazer chamadas ao modelo nem à rede.

## Live Arena Smoke Test

A primeira verificação da arena com modelo requer variáveis OpenRouter válidas:

```powershell
npm run arena -- --strategies react,plan-and-execute --max-iterations 8 "List firing alerts and summarize the most severe one"
```

Comportamento esperado:

- A solicitação é entregue à estratégia selecionada.
- A estratégia executa no máximo oito iterações de ferramenta.
- O comando imprime resposta final, trace ordenado, quantidade de chamadas LangChain em `IICalls` e latência total em `latencyMs`.
- Eventos de ação identificam ferramenta e argumentos; `thought` e `critique` contêm apenas resumos seguros.

## Error Checks

- Execute a arena sem solicitação posicional e confirme saída não zero antes de qualquer chamada ao modelo.
- Passe `--max-iterations 9` e confirme rejeição antes da execução.
- Use estratégia desconhecida e confirme diagnóstico conciso sem exposição de variáveis de ambiente.
- Em testes unitários, invoque ferramentas com serviço/incidente inválido e confirme que o store não foi alterado.

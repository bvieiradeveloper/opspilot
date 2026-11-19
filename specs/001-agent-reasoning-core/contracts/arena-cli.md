# Arena CLI Contract

## Invocation

```text
npm run arena -- [--strategies name[,name...]] [--max-iterations 1..8] <request>
```

- `<request>` é uma string posicional obrigatória, passada sem alteração a todas as estratégias selecionadas.
- `--strategies` é lista separada por vírgula de nomes registrados: `react` e `plan-and-execute`. Se omitido, executa todas as estratégias registradas.
- `--max-iterations` é inteiro de 1 a 8; padrão 8.
- Estratégia desconhecida, flag malformada, solicitação ausente ou limite inválido são rejeitados antes de chamadas ao modelo. O comando imprime diagnóstico conciso em stderr e termina com status não zero.

## Execution Semantics

- Executar estratégias selecionadas sequencialmente na ordem da flag (ou ordem do registro se omitida).
- Passar a mesma solicitação e limite a cada estratégia.
- Manter trace, contagem de chamadas e latência independentes por execução.
- Não imprimir credenciais, valores brutos de ambiente ou raciocínio privado do modelo.
- Falha de estratégia é reportada com status final não zero; as demais estratégias selecionadas podem continuar para que a arena reporte seus resultados.

## Output

Imprimir seção separada por estratégia contendo:

1. Nome da estratégia e resposta final.
2. Eventos formatados e ordenados do trace; ações incluem nome da ferramenta e argumentos.
3. Métricas `IICalls` e `latencyMs`.

A ordem é determinística para um dado resultado. A formatação do trace é função pura, testável sem acesso à rede.

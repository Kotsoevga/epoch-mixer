## Структура

- `contracts/EpochMixerZK.sol` — контракт эпохального миксера;
- `contracts/interfaces/IZKVerifier.sol` — интерфейс верификатора;
- `circuits/mixer.circom` — zk-схема;
- `circuits/merkle.circom` — проверка пути в дереве Меркла;
- `scripts/build.sh` — сборка схемы, zkey и экспорт Solidity verifier;
- `scripts/prepare_input.js` — построение дерева и подготовка `build/input.json`;
- `scripts/deposit_demo.js` — тестовый депозит и сохранение note;
- `scripts/withdraw_demo.js` — вызов `withdraw` по готовому доказательству;
- `script/DeployAndCloseZk.s.sol` — деплой verifier и миксера.

## Зависимости

- Node.js 18+
- Foundry (`forge`, `anvil`)
- `circom`
- `snarkjs`

Пример установки:

```bash
npm install
npm install -g snarkjs
```

Установка `circom` зависит от ОС. После установки команда `circom --help` должна работать из терминала.

## Базовый сценарий запуска

### 1. Собрать zk-часть

```bash
npm run build-zk
```

После этого появятся:

- `build/main_final.zkey`
- `build/verification_key.json`
- `contracts/Groth16Verifier.sol`

### 2. Запустить локальную ноду

```bash
anvil
```

### 3. Задать ключ деплоя и развернуть контракты

```bash
export PRIVATE_KEY=...
forge script script/DeployAndCloseZk.s.sol:DeployAndCloseZk --rpc-url http://127.0.0.1:8545 --broadcast
```

Необходимо запомнить адрес `EpochMixerZK`.

### 4. Выполнить депозит

Создай файл `build/demo-config.json`:

```json
{
  "rpcUrl": "http://127.0.0.1:8545",
  "privateKey": "<key of depositor>",
  "mixer": "<EpochMixerZK address>",
  "epochId": 0,
  "secret": "...",
  "randomness": "...",
  "recipient": "845593929344795711999980082787964258694651548241",
  "denominationWei": "1000000000000000000"
}
```

Поле `recipient` — это адрес получателя, переведённый в число `uint160`. Это можно сделать через `BigInt("0x...")` в Node.js.

Затем:

```bash
npm run deposit-demo -- build/demo-config.json
```

Результат сохранится в `build/demo-note.json`.

### 5. Закрыть интервал

Необходимо подготовить дерево:

```bash
npm run prepare-input -- build/demo-note.json
```

В `build/tree.json` взять поле `root`.

Затем вызвать `closeEpoch(epochId, root)` любым удобным способом, например через `cast`:

```bash
cast send <mixer-address> "closeEpoch(uint256,uint256)" 0 <root> --private-key $PRIVATE_KEY --rpc-url http://127.0.0.1:8545
```

### 6. Сгенерировать доказательство

```bash
npm run prove -- build/input.json
```

### 7. Выполнить вывод

Создать `build/withdraw-config.json`:

```json
{
  "rpcUrl": "http://127.0.0.1:8545",
  "privateKey": "<key of withdraw caller>",
  "mixer": "<EpochMixerZK address>",
  "epochId": 0,
  "recipientAddress": "0xRecipientAddress"
}
```

Запустить демонстрацию вывода средств:

```bash
npm run withdraw-demo -- build/withdraw-config.json
```

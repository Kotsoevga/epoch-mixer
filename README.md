## Структура

Ключевые файлы проекта:
- `contracts/EpochMixerZK.sol` — основной контракт эпохального миксера;
- `contracts/interfaces/IZKVerifier.sol` — интерфейс контракта-верификатора;
- `circuits/mixer.circom` — основная схема доказательства;
- `circuits/merkle.circom` — проверка пути включения в дерево Меркла;
- `scripts/build.sh` — сборка Circom-схемы, zkey-файлов и Solidity-верификатора;
- `scripts/prepare_input.js` — подготовка входных данных для доказательства;
- `scripts/deposit_demo.js` — выполнение тестового депозита;
- `scripts/withdraw_demo.js` — выполнение вывода по готовому доказательству;
- `script/DeployAndCloseZk.s.sol` — развёртывание верификатора и основного контракта.

## Зависимости

- Node.js
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
  "recipient": "...",
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

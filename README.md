## Структура

- `contracts/EpochMixerZK.sol` —  основной контракт интервального миксера;
- `contracts/interfaces/IZKVerifier.sol` — интерфейс контракта-верификатора;
- `circuits/mixer.circom` — основная схема доказательства;
- `circuits/merkle.circom` — проверка пути включения в дерево Меркла;
- `scripts/build.sh` — сборка Circom-схемы, zkey-файлов и Solidity-верификатора;
- `scripts/deploy_demo.js` — развертывание контрактов;
- `scripts/deposit_demo.js` — выполнение тестового депозита;
- `scripts/close_epoch_demo.js` — фиксация завершившегося интервала;
- `scripts/prepare_input.js` — подготовка входных данных для доказательства;
- `scripts/withdraw_demo.js` — выполнение вывода по готовому доказательству.


## Зависимости

- Node.js 18+
- локальная EVM-нода: `anvil` или `npx hardhat node`
- `circom`
- `snarkjs`

Установка зависимостей проекта:

```bash
npm install
npm install -g snarkjs
```

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

Например:

```bash
npx hardhat node
```

или:

```bash
anvil
```

### 3. Развернуть контракты

```bash
export PRIVATE_KEY=<private key of deployer>
export RPC_URL=http://127.0.0.1:8545
export EPOCH_LENGTH=30
npm run deploy-demo
```

Скрипт выведет адреса:

- `PoseidonT3`
- `Groth16Verifier`
- `EpochMixerZK`


### 4. Выполнить депозит

Создать файл `build/demo-config.json`:

```json
{
  "rpcUrl": "http://127.0.0.1:8545",
  "privateKey": "<key of depositor>",
  "mixer": "<EpochMixerZK address>",
  "secret": "123456789",
  "randomness": "987654321",
  "recipient": "845593929344795711999980082787964258694651548241",
  "denominationWei": "1000000000000000000"
}
```

Поле `recipient` — это адрес получателя, переведённый в число `uint160`.

```bash
npm run deposit-demo -- build/demo-config.json
```

Скрипт прочитает событие `Deposited`, получит фактический `epochId` и сохранит note в `build/demo-note.json`.

### 5. Завершить интервал

Закрывать можно только уже завершившийся интервал:

```solidity
require(epochId < currentEpoch(), "epoch not finished");
```

В локальной сети для тестирования можно задать небольшой `EPOCH_LENGTH` или сдвинуть время блокчейна средствами Anvil/Hardhat.

После завершения интервала:

```bash
export PRIVATE_KEY=<any private key>
npm run close-epoch-demo -- build/demo-note.json
```

Функция `closeEpoch(epochId)` не принимает root извне и не требует прав `owner`.
Контракт фиксирует собственный `epochCurrentRoot[epochId]` в `epochRoot[epochId]`.

### 6. Подготовить вход для доказательства

```bash
npm run prepare-input -- build/demo-note.json
```

Скрипт считывает commitments интервала, строит Merkle-path для конкретного депозита и проверяет, что локально вычисленный root совпадает с on-chain root.

### 7. Сгенерировать доказательство

```bash
npm run prove -- build/input.json
```

### 8. Выполнить вывод

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

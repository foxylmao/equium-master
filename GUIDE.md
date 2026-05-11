# Equium Fast Miner — полный гайд

> Это форк официального CLI-майнера Equium с оптимизированным солвером (~5× быстрее).
> Единственный изменённый файл — `crates/equihash-core/src/solver.rs`.

---

## Содержание

1. [Что такое Equium и зачем майнить](#1-что-такое-equium)
2. [Требования к серверу](#2-требования-к-серверу)
3. [Шаг 1 — Арендовать VPS](#шаг-1--арендовать-vps)
4. [Шаг 2 — Подключиться к серверу](#шаг-2--подключиться-к-серверу)
5. [Шаг 3 — Установить майнер](#шаг-3--установить-майнер)
6. [Шаг 4 — Создать кошелёк](#шаг-4--создать-кошелёк)
7. [Шаг 5 — Получить RPC-ключ](#шаг-5--получить-rpc-ключ)
8. [Шаг 6 — Запустить майнер](#шаг-6--запустить-майнер)
9. [Шаг 7 — Запуск как сервис (автозапуск)](#шаг-7--запуск-как-сервис)
10. [Мониторинг и управление](#мониторинг-и-управление)
11. [Производительность и настройка](#производительность-и-настройка)
12. [Что делать с намайненными EQM](#что-делать-с-намайненными-eqm)
13. [Частые проблемы](#частые-проблемы)

---

## 1. Что такое Equium

**Equium ($EQM)** — токен на Solana с майнингом по модели Bitcoin.

- Алгоритм **Equihash (96, 5)** — memory-bound, CPU-friendly. GPU не даёт преимущества.
- Каждые ~1 минуту открывается новый раунд, победитель получает **25 EQM** (сейчас).
- Сложность автоматически корректируется каждые 60 блоков (~1 час).
- Всего будет выпущено **21 000 000 EQM**, 90% через майнинг.

**Расписание халвингов:**

| Эпоха | Награда за блок | Когда примерно |
|-------|----------------|----------------|
| 1 (сейчас) | 25 EQM | первые ~8.6 мес |
| 2 | 12.5 EQM | ~8.6–17.2 мес |
| 3 | 6.25 EQM | ~17.2–25.8 мес |
| 4 | 3.125 EQM | ~25.8–34.5 мес |

**Вывод:** сейчас самое выгодное время — первая эпоха с максимальной наградой.

---

## 2. Требования к серверу

| VPS | Потоки | Хэшрейт | RAM | Рекомендация |
|-----|--------|---------|-----|--------------|
| 1 vCPU / 1 GB | 1 | ~6 H/s | ~414 MB | минимум |
| 2 vCPU / 2 GB | 2 | ~12 H/s | ~572 MB | хороший старт |
| 4 vCPU / 4 GB | 4 | ~24 H/s | ~888 MB | ✓ оптимально |
| 8 vCPU / 8 GB | 8 | ~48 H/s | ~1.5 GB | отлично |
| 16 vCPU / 32 GB | 16 | ~97 H/s | ~2.8 GB | максимум |

> Цифры — наш оптимизированный солвер. Референсный майнер ~5× медленнее.

**ОС:** Ubuntu 22.04 или 24.04 LTS (рекомендуется), Debian 11/12, любой современный Linux.

**Сеть:** нужен стабильный интернет с минимальным пингом до Solana-нод.
Европейские и US-датацентры подходят лучше всего.

---

## Шаг 1 — Арендовать VPS

Подойдёт любой VPS-провайдер. Несколько вариантов:

**Дешёвые (хорошо для старта):**
- [Hetzner](https://hetzner.com) — CPX21 (3 vCPU / 4 GB) ~€5/мес. Лучший выбор по цена/качество.
- [Contabo](https://contabo.com) — VPS S (4 vCPU / 8 GB) ~€5/мес. Много RAM.
- [Vultr](https://vultr.com) — 2 vCPU / 2 GB ~$12/мес.

**Быстрые (если хочешь много потоков):**
- [OVHcloud](https://ovhcloud.com) — Advance серия, выделенные vCPU.
- [DigitalOcean](https://digitalocean.com) — CPU-Optimized дроплеты.

**При создании сервера выбирай:**
- Ubuntu 22.04 LTS или 24.04 LTS
- Регион: Германия / Финляндия / Нью-Йорк (низкий пинг до Solana)
- Аутентификация: **SSH-ключ** (безопаснее пароля)

---

## Шаг 2 — Подключиться к серверу

```bash
# Заменить 1.2.3.4 на IP твоего сервера
ssh root@1.2.3.4
```

Если настроил SSH-ключ при создании — попадёшь сразу. Если пароль — введи его.

**Обновить систему сразу после входа:**

```bash
apt update && apt upgrade -y
```

---

## Шаг 3 — Установить майнер

Клонируй форк и запусти установщик:

```bash
git clone https://github.com/YOUR_FORK/equium.git
cd equium
bash install.sh
```

Установщик сделает всё автоматически:

1. Установит `build-essential`, `libssl-dev`, `pkg-config` через apt
2. Установит Rust через rustup (если нет)
3. Скомпилирует майнер с `target-cpu=native` + LTO (~5 минут)
4. Положит бинарник в `/usr/local/bin/equium-miner`
5. Установит systemd-сервис

Когда увидишь `Installation complete!` — всё готово.

**Проверка:**

```bash
equium-miner --version
# equium-miner 0.1.0

equium-miner --help
```

---

## Шаг 4 — Создать кошелёк

Майнеру нужен Solana-кошелёк. Награды приходят прямо на него.

```bash
# Установить Solana CLI (нужен только для создания кошелька)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Создать кошелёк для майнера
mkdir -p /etc/equium
solana-keygen new --no-bip39-passphrase -o /etc/equium/wallet.json

# Защитить файл (читать может только root)
chmod 600 /etc/equium/wallet.json
chown root:root /etc/equium/wallet.json
```

После создания ты увидишь **публичный адрес** (pubkey) — это твой адрес для получения EQM.

```bash
# Посмотреть адрес кошелька
solana-keygen pubkey /etc/equium/wallet.json
# Пример: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

**Пополнить кошелёк SOL для комиссий:**

Майнер тратит ~0.001 SOL на каждый намайненный блок (комиссия за транзакцию).
Пополни кошелёк примерно на **0.1–0.5 SOL** — этого хватит надолго.

Перевести SOL можно с любой биржи (Binance, OKX и др.) на адрес из команды выше.

**Проверить баланс:**

```bash
solana balance /etc/equium/wallet.json --url mainnet-beta
```

---

## Шаг 5 — Получить RPC-ключ

Публичные Solana-эндпоинты агрессивно ограничивают запросы при майнинге.
Нужен выделенный RPC — возьми бесплатный от **Helius**.

1. Иди на [helius.dev](https://www.helius.dev)
2. Зарегистрируйся (email)
3. Создай новый проект → тип **Solana Mainnet**
4. Скопируй URL вида:
   ```
   https://mainnet.helius-rpc.com/?api-key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

Бесплатный тариф: 100K кредитов/день — хватит для майнинга на 1–4 потоках.
Если нужно больше — платные тарифы от $49/мес или используй [Triton](https://triton.one).

---

## Шаг 6 — Запустить майнер

### Тестовый запуск (в терминале)

Сначала запусти вручную чтобы убедиться, что всё работает:

```bash
equium-miner \
  --keypair /etc/equium/wallet.json \
  --rpc-url "https://mainnet.helius-rpc.com/?api-key=ВАШ_КЛЮЧ"
```

Ты должен увидеть что-то вроде:

```
   ███████╗ ██████╗ ██╗   ██╗██╗██╗   ██╗███╗   ███╗
   ...
   miner     7xKX…AsU
   program   ZKGM…EQM
   network   mainnet
   threads   4
   solver    ~5× optimised (radix sort + arena + bitset)
   ──────────────────────────────────────────────────────

   round #1042   reward 25 EQM   target 0x10ffff…
   ──────────────────────────────────────────────────────
     · try #1   above target        165ms   6.0 H/s
     · try #2   above target        163ms   6.0 H/s
     ✓ MINED!   +25 EQM     try #3   167ms   6.0 H/s
       sig 4xZ9Ks…2pH8Yt
```

**Что означают строчки:**
- `round #1042` — номер текущего блока
- `target 0x10ffff…` — текущая сложность (чем меньше, тем сложнее)
- `· try #N above target` — нонс найден, но не прошёл по сложности, пробуем снова
- `✓ MINED! +25 EQM` — блок намайнен, награда отправлена на кошелёк
- `6.0 H/s` — текущий хэшрейт

Если всё работает — останови (`Ctrl+C`) и настрой автозапуск.

---

## Шаг 7 — Запуск как сервис

Сервис запускает майнер автоматически при старте сервера и перезапускает при падениях.

### Отредактируй конфиг сервиса

```bash
nano /etc/systemd/system/equium-miner.service
```

Найди и измени эти три строчки:

```ini
Environment="RPC_URL=https://mainnet.helius-rpc.com/?api-key=ВАШ_КЛЮЧ"
Environment="KEYPAIR=/etc/equium/wallet.json"
Environment="THREADS=0"
```

> `THREADS=0` значит «использовать все ядра» — это оптимально.
> Если хочешь оставить ядра для других задач — поставь конкретное число, например `THREADS=2`.

Сохранить: `Ctrl+O`, Enter, `Ctrl+X`.

### Включить и запустить

```bash
# Применить изменения конфига
systemctl daemon-reload

# Включить автозапуск при старте сервера
systemctl enable equium-miner

# Запустить прямо сейчас
systemctl start equium-miner

# Проверить статус
systemctl status equium-miner
```

Должно показать `● equium-miner.service - Equium... Active: active (running)`.

---

## Мониторинг и управление

### Смотреть логи в реальном времени

```bash
journalctl -u equium-miner -f
```

### Посмотреть последние 50 строк

```bash
journalctl -u equium-miner -n 50
```

### Логи за последний час

```bash
journalctl -u equium-miner --since "1 hour ago"
```

### Перезапустить (например, после изменения конфига)

```bash
systemctl restart equium-miner
```

### Остановить

```bash
systemctl stop equium-miner
```

### Проверить баланс кошелька

```bash
solana balance /etc/equium/wallet.json --url mainnet-beta
```

### Посмотреть транзакции (намайненные блоки)

Открой в браузере:
```
https://solscan.io/account/ВАШ_АДРЕС_КОШЕЛЬКА
```
Адрес кошелька:
```bash
solana-keygen pubkey /etc/equium/wallet.json
```

---

## Производительность и настройка

### Сколько потоков использовать

- `--threads 0` — все ядра (по умолчанию, максимальный хэшрейт)
- `--threads 2` — оставить ядра для других задач на сервере
- Каждый поток потребляет ~158 MB RAM

**Примерный хэшрейт нашего оптимизированного солвера:**

| Потоки | H/s | RAM |
|--------|-----|-----|
| 1 | ~6 H/s | ~414 MB |
| 2 | ~12 H/s | ~572 MB |
| 4 | ~24 H/s | ~888 MB |
| 8 | ~48 H/s | ~1.5 GB |
| 16 | ~97 H/s | ~2.8 GB |

### Почему наш солвер быстрее референса

Оригинальный майнер от команды Equium: **~1.2 H/s** на одном потоке.
Наш: **~6 H/s** на одном потоке. Разница — в алгоритме:

| Что | Референс | Наш |
|-----|----------|-----|
| Хранение строк | `Vec<Vec<u8>>` — куча аллокаций | плоская арена, 1 аллокация |
| Сортировка | `sort_by` O(n log n) | LSD radix sort O(n) |
| Проверка уникальности | вложенный цикл O(n²) | bitset O(n) |
| Буферы между нонсами | создаются заново | thread-local, переиспользуются |

### Параметр `--max-nonces-per-round`

По умолчанию `4096` — сколько нонсов пробует каждый поток перед тем как
перечитать состояние сети. Повышать смысла нет — если за 4096 попыток не нашёл,
значит другой майнер уже выиграл раунд и нужно начать следующий.

### Несколько серверов

Можно запустить майнер на нескольких VPS с одним и тем же кошельком.
Награды будут приходить на один адрес. Каждый сервер конкурирует независимо.

---

## Что делать с намайненными EQM

### Где хранятся EQM

Токены автоматически появляются в **Associated Token Account** твоего кошелька
на Solana. Смотреть через [Solscan](https://solscan.io) или [Phantom Wallet](https://phantom.app).

### Как вывести в Phantom / другой кошелёк

1. Открой [Phantom](https://phantom.app) или любой Solana-кошелёк
2. Нажми **Receive** → скопируй адрес
3. На сервере:

```bash
# Перевести EQM в другой кошелёк
spl-token transfer \
  --url mainnet-beta \
  --owner /etc/equium/wallet.json \
  1MhvZzEe8gQ8Rb9CrT3Dn26Gkn9QRErzLMGkkTwveqm \
  КОЛИЧЕСТВО \
  АДРЕС_ПОЛУЧАТЕЛЯ
```

> Адрес минта EQM: `1MhvZzEe8gQ8Rb9CrT3Dn26Gkn9QRErzLMGkkTwveqm`
> Всегда проверяй этот адрес на [equium.xyz](https://equium.xyz) — используй только официальный.

### Продать EQM

Проект ещё в стадии devnet → mainnet. Когда откроются DEX-пары
(Jupiter, Raydium), продавать можно будет напрямую в SOL или USDC.
Следи за [@EquiumEQM](https://x.com/EquiumEQM) для анонсов.

---

## Частые проблемы

### `blockhash expired` или `blockhash not found`

**Причина:** RPC-нода слишком медленная, блокхэш устарел пока шла транзакция.

**Решение:** перейди на Helius или другой быстрый RPC:
```bash
# В /etc/systemd/system/equium-miner.service замени RPC_URL
# После редактирования:
systemctl daemon-reload && systemctl restart equium-miner
```

---

### `stale challenge`

**Причина:** другой майнер успел найти блок раньше тебя. Это нормально.
Майнер автоматически переходит к следующему раунду.

---

### `above target`

**Причина:** нашёл валидное Equihash-решение, но оно не прошло по сложности.
Тоже нормально — просто пробуем ещё нонс.

---

### Майнер завис, нет новых логов

```bash
# Проверить статус
systemctl status equium-miner

# Принудительно перезапустить
systemctl restart equium-miner
```

---

### `Error: read keypair ...`

**Причина:** неправильный путь к файлу кошелька или нет прав на чтение.

```bash
# Проверить что файл существует
ls -la /etc/equium/wallet.json

# Проверить права (должно быть -rw-------)
# Если сервис запускается не от root — дай права пользователю сервиса
chmod 600 /etc/equium/wallet.json
```

---

### `insufficient funds` / нет SOL для комиссий

**Причина:** закончился SOL на кошельке майнера.

```bash
# Проверить баланс
solana balance /etc/equium/wallet.json --url mainnet-beta

# Пополнить с биржи — нужен адрес:
solana-keygen pubkey /etc/equium/wallet.json
```

Пополняй заранее — при нуле SOL майнер не может отправить транзакцию и
молча проигрывает каждый раунд.

---

### Высокое потребление CPU / греется сервер

Это норма — майнер специально нагружает CPU на 100%.
Если не хочешь этого — ограничь число потоков:

```bash
# В /etc/systemd/system/equium-miner.service
Environment="THREADS=2"   # например, оставить 2 ядра из 4
```

---

### Обновление майнера

```bash
cd /opt/equium-fast-miner   # или куда клонировал
git pull
RUSTFLAGS="-C target-cpu=native" cargo build -p equium-cli-miner --release
sudo install -m 755 target/release/equium-miner /usr/local/bin/equium-miner
sudo systemctl restart equium-miner
```

---

## Быстрая шпаргалка

```bash
# Статус
systemctl status equium-miner

# Логи в реальном времени
journalctl -u equium-miner -f

# Перезапустить
systemctl restart equium-miner

# Баланс SOL
solana balance /etc/equium/wallet.json --url mainnet-beta

# Мой адрес (для пополнения и вывода)
solana-keygen pubkey /etc/equium/wallet.json

# Изменить конфиг (RPC URL, потоки)
nano /etc/systemd/system/equium-miner.service
systemctl daemon-reload && systemctl restart equium-miner
```

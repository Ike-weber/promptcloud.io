# PromptCloud Deployment Reference

This document contains all CloudStack IDs needed for VM, Volume, and DB deployments.

## Zones

| ID | Name | Network Type | Location |
|----|------|--------------|----------|
| `c843ba49-21c3-4616-a3ff-07bb91db3a6b` | CS-SIM1 Adv Zone x86 | Advanced | CS-SIM1 |
| `1ff9263f-bdcb-4c45-ac93-1973567b2010` | IN-GGN1 SG Zone ARM64 | Advanced | IN-GGN1 |
| `aaddcb34-898b-469a-ba8e-ff14b424dce0` | EU-SOF1 Adv VMware x86 | Basic | EU-SOF1 |
| `b8051512-8354-4e47-bf44-40b00dbcda90` | UK-LON2 Adv Zone x86 | Advanced | UK-LON2 |
| `673911f1-d15d-453a-a021-4556b0a6495f` | IN-BLR1 Basic Zone x86 | Basic | IN-BLR1 |
| `7027ab97-3e5b-41cb-a1d1-059c01361767` | CH-GVA1 Edge Zone ARM64 | Advanced | CH-GVA1 |

## Service Offerings (VM Plans)

| ID | Name | CPU | RAM (MB) |
|----|------|-----|----------|
| `725752c6-9754-40b9-a4b9-691b496843f3` | GPU Offering | 1 | 1024 |
| `1be5e5c5-1a1e-4a61-b717-b19ba10579aa` | Small Instance | 1 | 512 |
| `30e662ef-a37e-46ad-b7c5-35fb6270d6ee` | Medium Instance | 1 | 1024 |
| `21e87471-8dbc-47c5-a803-d9a56f3ad7cb` | Kubernetes | 2 | 4096 |
| `40571127-1cf9-4de4-bf15-10e50d4c4bc7` | Custom Offering | - | - |

## Disk Offerings (Volumes)

| ID | Name | Size (GB) | Customizable |
|----|------|-----------|--------------|
| `e1f83100-ee1f-4dd2-882c-c11b48e99848` | Custom | 0 | Yes |
| `efb8b990-4566-4f72-b219-00f10a7d8477` | Large | 100 | No |
| `0df6644c-89f8-4241-82e9-e6b1048b6015` | Medium | 20 | No |
| `07b878b9-5098-43eb-a844-27b02a0ae529` | Small | 5 | No |

## Networks

| ID | Name | Zone | Type |
|----|------|------|------|
| `80e5ad76-be5d-4a8a-b74b-a3187cc71a05` | defaultGuestNetwork | EU-SOF1 Adv VMware x86 | Shared |
| `00089a57-3cc1-4ddc-973c-251a6f097372` | test-network | CS-SIM1 Adv Zone x86 | Isolated |
| `0158f28f-47c1-413f-99ff-ad78e4915a7a` | defaultGuestNetwork | IN-BLR1 Basic Zone x86 | Shared |
| `59382084-00e1-4910-9e2b-35548bbb0a3c` | defaultGuestNetwork | IN-GGN1 SG Zone ARM64 | Shared |
| `eaa6b5e7-3294-4818-923e-14ecf38514d2` | Admin Shared Network | CS-SIM1 Adv Zone x86 | Shared |
| `a5d26753-c77f-4891-8914-e9706151964a` | Admin L2 Network | CS-SIM1 Adv Zone x86 | L2 |
| `d53dbb98-78ac-4ef2-8513-d47fea77b57a` | Admin VPC Tier2 | CS-SIM1 Adv Zone x86 | Isolated |
| `c77d52ff-a6e4-4434-87fd-756b1cc5178e` | Admin VPC Tier1 | CS-SIM1 Adv Zone x86 | Isolated |
| `6d625e42-f1cc-4fe1-be95-a28256fc6df2` | Admin Isolated Network | CS-SIM1 Adv Zone x86 | Isolated |

## Templates by Zone

### CS-SIM1 Adv Zone x86 (`c843ba49-21c3-4616-a3ff-07bb91db3a6b`)
| ID | Name | OS |
|----|------|-----|
| `c7ae52cc-9519-49e0-8e7b-6df81976011b` | Ubuntu 20.04 x64 | Ubuntu 20.04 LTS |
| `0392376b-ac6c-46cd-be15-48d8ea3ba175` | Debian 12 x64 | Debian GNU/Linux 12 (64-bit) |
| `a7506f54-f61b-47b0-8540-0c1c7c162185` | RHEL 9 x64 | Red Hat Enterprise Linux 9 |
| `0c044204-6c15-11ed-86c2-1e0093003d07` | CentOS 5.6 (64-bit) no GUI (Simulator) | CentOS 5.6 (64-bit) |

### IN-GGN1 SG Zone ARM64 (`1ff9263f-bdcb-4c45-ac93-1973567b2010`)
| ID | Name | OS |
|----|------|-----|
| `c7ae52cc-9519-49e0-8e7b-6df81976011b` | Ubuntu 20.04 x64 | Ubuntu 20.04 LTS |
| `0392376b-ac6c-46cd-be15-48d8ea3ba175` | Debian 12 x64 | Debian GNU/Linux 12 (64-bit) |
| `a7506f54-f61b-47b0-8540-0c1c7c162185` | RHEL 9 x64 | Red Hat Enterprise Linux 9 |
| `99bcd10d-eaa4-4ad6-8169-7cf204fbc0b3` | Rocky 9 x64 | Red Hat Enterprise Linux 9.0 |
| `0c044204-6c15-11ed-86c2-1e0093003d07` | CentOS 5.6 (64-bit) no GUI (Simulator) | CentOS 5.6 (64-bit) |

### EU-SOF1 Adv VMware x86 (`aaddcb34-898b-469a-ba8e-ff14b424dce0`)
_No templates available in this zone._

### UK-LON2 Adv Zone x86 (`b8051512-8354-4e47-bf44-40b00dbcda90`)
_No templates available in this zone._

### IN-BLR1 Basic Zone x86 (`673911f1-d15d-453a-a021-4556b0a6495f`)
| ID | Name | OS |
|----|------|-----|
| `c7ae52cc-9519-49e0-8e7b-6df81976011b` | Ubuntu 20.04 x64 | Ubuntu 20.04 LTS |
| `0392376b-ac6c-46cd-be15-48d8ea3ba175` | Debian 12 x64 | Debian GNU/Linux 12 (64-bit) |
| `a7506f54-f61b-47b0-8540-0c1c7c162185` | RHEL 9 x64 | Red Hat Enterprise Linux 9 |
| `99bcd10d-eaa4-4ad6-8169-7cf204fbc0b3` | Rocky 9 x64 | Red Hat Enterprise Linux 9.0 |
| `0c044204-6c15-11ed-86c2-1e0093003d07` | CentOS 5.6 (64-bit) no GUI (Simulator) | CentOS 5.6 (64-bit) |

### CH-GVA1 Edge Zone ARM64 (`7027ab97-3e5b-41cb-a1d1-059c01361767`)
_No templates available in this zone._

## How to Use These IDs

### VM Deploy
```json
{
  "name": "my-vm",
  "zoneId": "<Zone ID>",
  "offeringId": "<Service Offering ID>",
  "templateId": "<Template ID for that zone>",
  "networkId": "<Network ID in that zone>"
}
```

### Volume Create
```json
{
  "name": "my-volume",
  "zoneId": "<Zone ID>",
  "diskOfferingId": "<Disk Offering ID>",
  "size": 10  // only for customizable offerings
}
```

### DB Deploy
Same as VM deploy but use DB-specific templates (if available).

interface Props {
  tamanho?: number
  className?: string
}

const base = (tamanho: number) => ({
  width: tamanho,
  height: tamanho,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
})

export const IconeInicio = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1H9.5v-5.5h5V21h3a1 1 0 0 0 1-1V9.5" />
  </svg>
)

export const IconeClientes = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
    <path d="M16.5 5.2a3.2 3.2 0 0 1 0 6" />
    <path d="M18.2 14.4A5.6 5.6 0 0 1 21.6 20" />
  </svg>
)

export const IconeContratos = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M6 2.8h8.2L19 7.6V21a.8.8 0 0 1-.8.8H6a.8.8 0 0 1-.8-.8V3.6A.8.8 0 0 1 6 2.8Z" />
    <path d="M14 2.8v5h5" />
    <path d="M8.4 12.6h7.2M8.4 16.2h7.2" />
  </svg>
)

export const IconeVencimentos = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <rect x="3.2" y="4.8" width="17.6" height="16" rx="2" />
    <path d="M3.2 9.6h17.6M8 2.8v4M16 2.8v4" />
    <path d="M8.6 14.4h2.2M13.4 14.4h2.2M8.6 17.4h2.2M13.4 17.4h2.2" />
  </svg>
)

export const IconeMais = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="5.2" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="18.8" cy="12" r="1.6" />
  </svg>
)

export const IconeBusca = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="10.8" cy="10.8" r="6.4" />
    <path d="m15.6 15.6 4 4" />
  </svg>
)

export const IconeAdicionar = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M12 5.2v13.6M5.2 12h13.6" />
  </svg>
)

export const IconeSeta = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </svg>
)

export const IconeVoltar = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
  </svg>
)

export const IconeCheck = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="m4.8 12.6 4.6 4.6 9.8-10.4" />
  </svg>
)

export const IconeAtencao = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M12 3.8 21.2 20H2.8L12 3.8Z" />
    <path d="M12 10v4.2M12 17.4h.01" />
  </svg>
)

export const IconeInfo = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="12" cy="12" r="8.8" />
    <path d="M12 11.2v5M12 8.1h.01" />
  </svg>
)

export const IconeFechar = ({ tamanho = 20, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconeImprimir = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M7 9.2V3.8h10v5.4" />
    <path d="M7 17.4H5a1.6 1.6 0 0 1-1.6-1.6v-4.6A1.6 1.6 0 0 1 5 9.6h14a1.6 1.6 0 0 1 1.6 1.6v4.6a1.6 1.6 0 0 1-1.6 1.6h-2" />
    <rect x="7" y="14.4" width="10" height="5.8" rx="1" />
  </svg>
)

export const IconeCompartilhar = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M12 3.6v11.2" />
    <path d="m8 7.4 4-3.8 4 3.8" />
    <path d="M6 12.2H4.8A1.6 1.6 0 0 0 3.2 13.8v5.2a1.6 1.6 0 0 0 1.6 1.6h14.4a1.6 1.6 0 0 0 1.6-1.6v-5.2a1.6 1.6 0 0 0-1.6-1.6H18" />
  </svg>
)

export const IconeDesfazer = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M3.8 8.4h7.6a6 6 0 1 1 0 12H7" />
    <path d="m7.2 4.4-3.4 4 3.4 4" />
  </svg>
)

export const IconeEditar = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M15.6 4.6a2.1 2.1 0 0 1 3 3L9 17.2l-4 1 1-4 9.6-9.6Z" />
  </svg>
)

export const IconePix = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M8.4 3.9 3.9 8.4a2.4 2.4 0 0 0 0 3.4l4.5 4.5" />
    <path d="M15.6 20.1l4.5-4.5a2.4 2.4 0 0 0 0-3.4l-4.5-4.5" />
    <path d="M8.9 8.9 12 5.8l3.1 3.1M8.9 15.1 12 18.2l3.1-3.1" />
  </svg>
)

export const IconeRelogio = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.2V12l3.2 1.8" />
  </svg>
)

export const IconeAjustes = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M4.2 7.2h10.2M18.4 7.2h1.4M4.2 16.8h5.2M13.4 16.8h6.4" />
    <circle cx="16.4" cy="7.2" r="2.2" />
    <circle cx="11.4" cy="16.8" r="2.2" />
  </svg>
)

export const IconeCalendario = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <rect x="3.4" y="5" width="17.2" height="15.6" rx="2" />
    <path d="M3.4 9.6h17.2M8 2.8v4M16 2.8v4" />
  </svg>
)

export const IconeUsuario = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="12" cy="8.2" r="3.6" />
    <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
  </svg>
)

export const IconeCofre = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <rect x="2.8" y="6.2" width="18.4" height="11.6" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.4v5.2M18 9.4v5.2" />
  </svg>
)

export const IconeTelefone = ({ tamanho = 16, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M6.2 3.8h3l1.4 3.6-2 1.5a11.4 11.4 0 0 0 5.5 5.5l1.5-2 3.6 1.4v3a1.6 1.6 0 0 1-1.7 1.6C10.2 18 6 13.8 4.6 5.5a1.6 1.6 0 0 1 1.6-1.7Z" />
  </svg>
)

export const IconeRestaurar = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <path d="M20.2 12a8.2 8.2 0 1 1-2.6-6" />
    <path d="M20.4 3.6v5h-5" />
  </svg>
)

export const IconeQuitar = ({ tamanho = 18, className }: Props) => (
  <svg {...base(tamanho)} className={className}>
    <circle cx="12" cy="12" r="8.8" />
    <path d="m8 12.2 2.8 2.8L16.4 9.4" />
  </svg>
)

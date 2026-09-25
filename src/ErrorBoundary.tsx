import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Wargame render error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="fatal-error">
        <section>
          <p className="eyebrow">WARGAME / ERROR</p>
          <h1>게임 화면을 불러오지 못했습니다.</h1>
          <p>{this.state.message}</p>
          <button onClick={() => window.location.reload()}>페이지 다시 불러오기</button>
        </section>
      </main>
    )
  }
}

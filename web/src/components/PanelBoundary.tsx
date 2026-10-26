import { Component, type ReactNode } from "react";
export class PanelBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error) {
    console.error("Không thể hiển thị panel:", error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="panel-error" role="alert">
          <h3>Không thể hiển thị nội dung này</h3>
          <p>
            Bạn có thể thử lại hoặc chuyển sang mục khác. Dữ liệu đã lưu vẫn
            được giữ nguyên.
          </p>
          <button onClick={() => this.setState({ error: false })}>
            Thử lại
          </button>
        </div>
      );
    return this.props.children;
  }
}

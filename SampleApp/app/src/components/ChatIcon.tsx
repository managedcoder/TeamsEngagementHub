import './ChatIcon.css';

export const ChatIcon = (props: { onClick: () => void }): JSX.Element => {
    return (
        <div style={{ position: 'fixed', right: 15, bottom: 10 }}>
            <img height={75} width={75} src="ChatIcon.png" onClick={() => props.onClick()} />
        </div>
    )
}

export default ChatIcon;
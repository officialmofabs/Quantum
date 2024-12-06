import ReactDOM from 'react-dom/client';
import Application from '@/Application.tsx';
import store from '@services/store';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from 'react-query'
import { BrowserRouter } from 'react-router-dom';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
            retry: 3
        }
    }
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <BrowserRouter>
        <Provider store={store}>
            <QueryClientProvider client={queryClient}>
                <Application />
            </QueryClientProvider>
        </Provider>
    </BrowserRouter>
);